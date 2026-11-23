// 고객 화면 권한 점검(docs/security-review.md 2장, X-102): 손님은 본인 예약·홀딩·계정만 보고 바꾼다.
// 주소나 입력으로 남의 id를 넣어도 내 계정(로그인 세션) 것만 열리고 바뀌는지, 로그인 안 함·원장님 모드는 막히는지 본다.
// 서버 흐름 테스트(tests/flows/)처럼 화면이 부르는 실제 서버 함수를 테스트 DB에서 부르고, 로그인·시각과
// 요청이 있어야 도는 Next.js 도구(쿠키·헤더·after·refresh)만 가짜로 바꾼다. 예약은 FLOW-01과 같은 실제 결제 흐름(bookSlot)으로 만든다.
// 내 예약 상세 화면은 getMyReservationDetail이 NOT_FOUND면 404(notFound)를 보여 준다([reservationId]/page.tsx).

import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import { loadCompletedReservation } from '@/app/(customer)/(focus)/payment/result/actions';
import { setFavorite } from '@/app/(customer)/(tabs)/home/favorites/actions';
import { updateMyPhone, updateMyProfile } from '@/app/(customer)/(tabs)/me/actions';
import {
  getMyReservationDetail,
  getMyReservations,
} from '@/app/(customer)/(tabs)/reservations/queries';
import { RESERVATION_TABS } from '@/app/(customer)/(tabs)/reservations/reservation-tabs';
import { customers, favorites } from '@/db/schema';
import { getMyHold, holdSlot, previewCheckoutAmount } from '@/server/payments/checkout';

import { createTestCustomer, createTestShop } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { bookSlot, publishSlot } from '../../../tests/flows/booking';
import { dataOf, flow, resetFlow, signIn } from '../../../tests/flows/fakes';

vi.mock('@/db', async () => (await import('../../../tests/flows/fakes')).fakeDb);
vi.mock(
  '@/lib/request-time',
  async () => (await import('../../../tests/flows/fakes')).fakeRequestTime,
);
vi.mock(
  '@/server/supabase/server',
  async () => (await import('../../../tests/flows/fakes')).fakeSupabase,
);
vi.mock('next/headers', async () => (await import('../../../tests/flows/fakes')).fakeNextHeaders);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  ...(await import('../../../tests/flows/fakes')).fakeNextServer,
}));
vi.mock('@/server/payments/portone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payments/portone')>()),
  ...(await import('../../../tests/flows/fakes')).fakePortOne,
}));
vi.mock(
  '@/server/notifications/send-web-push',
  async () => (await import('../../../tests/flows/fakes')).fakeWebPush,
);
// 저장한 뒤 화면을 다시 그리는 refresh()는 요청 안에서만 돈다. 여기서는 아무것도 하지 않는다
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  refresh: () => {},
}));

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

/** 서비스는 11/5(목) 15:00~16:00. 게시는 시작 48시간 전(S-204) */
const SLOT_TIMES = {
  startAt: kst('2026-11-05T15:00:00'),
  endAt: kst('2026-11-05T16:00:00'),
  publishAt: kst('2026-11-03T15:00:00'),
};
/** 손님 A가 [예약하기]를 누르고 결제를 마친 시각 */
const A_BOOKING = { browseAt: kst('2026-11-04T10:00:00'), paidAt: kst('2026-11-04T10:05:00') };

/** 이 고객 계정의 이름·닉네임·연락처 */
async function profileOf(tx: TestTx, customerId: string) {
  const [row] = await tx
    .select({ name: customers.name, nickname: customers.nickname, phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, customerId));
  return row;
}

/** 이 고객이 찜한 샵 id들 */
async function favoriteShopsOf(tx: TestTx, customerId: string) {
  const rows = await tx
    .select({ shopId: favorites.shopId })
    .from(favorites)
    .where(eq(favorites.customerId, customerId));
  return rows.map((row) => row.shopId);
}

describeDb('고객 화면 권한 점검 (X-102, 실제 DB)', () => {
  beforeEach(() => {
    resetFlow();
    // 결제 시작은 포트원 상점 값이 있어야 결제창 값을 돌려준다. 가짜 값이고 포트원은 부르지 않는다
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store-access-test');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'channel-access-test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(closeTestDb);

  it('다른 손님의 예약 id로 내 예약 상세·예약 완료 화면을 열면 찾을 수 없다(화면은 404), 모양이 틀린 id도 같다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const booked = await bookSlot(tx, { shop, customer: a, ...SLOT_TIMES, ...A_BOOKING });

      // A 본인은 열린다(막는 조건이 아무 예약이나 막지 않는지)
      signIn(a.userId, 'customer');
      expect(dataOf(await getMyReservationDetail(booked.reservationId))).toMatchObject({
        reservationId: booked.reservationId,
      });
      expect(dataOf(await loadCompletedReservation(booked.reservationId))).toMatchObject({
        amount: 45000,
      });

      // B는 A의 예약 id로 열 수 없고, 내 예약 탭 어디에도 A의 예약이 없다
      signIn(b.userId, 'customer');
      const notFound = { ok: false, error: { code: 'NOT_FOUND' } };
      expect(await getMyReservationDetail(booked.reservationId)).toMatchObject(notFound);
      expect(await loadCompletedReservation(booked.reservationId)).toMatchObject(notFound);
      expect(await getMyReservationDetail('not-a-reservation-id')).toMatchObject(notFound);
      for (const tab of RESERVATION_TABS) {
        expect(dataOf(await getMyReservations(tab.key))).toEqual([]);
      }
    });
  });

  it('다른 손님이 결제 중인 매물로 예약 확인 화면을 열면 그 홀딩이 보이지 않고 금액 미리보기도 막힌다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const slotId = await publishSlot(tx, shop, SLOT_TIMES);

      flow.now = A_BOOKING.browseAt;
      signIn(a.userId, 'customer');
      dataOf(await holdSlot(slotId));
      expect(dataOf(await getMyHold(slotId))).toMatchObject({ slotId, amount: 45000 });

      // B에게는 내 홀딩이 없다(화면은 "결제 가능 시간이 끝났어요" 안내로 상세에 돌려보낸다)
      signIn(b.userId, 'customer');
      expect(dataOf(await getMyHold(slotId))).toBeNull();
      expect(await previewCheckoutAmount({ slotId, couponId: null })).toMatchObject({
        ok: false,
        error: { code: 'NOT_HOLDER' },
      });
    });
  });

  it('내 정보·연락처·찜을 저장할 때 입력에 다른 손님의 계정 id를 넣어도 내 계정만 바뀐다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      await tx
        .update(customers)
        .set({ name: '에이', nickname: '에이 닉네임', phone: '010-0000-0001' })
        .where(eq(customers.id, a.customerId));
      const aBefore = await profileOf(tx, a.customerId);

      signIn(b.userId, 'customer');
      const intruder = { customerId: a.customerId, userId: a.userId };
      dataOf(
        await updateMyProfile({
          name: '비',
          nickname: '비 닉네임',
          phone: '010-0000-0002',
          ...intruder,
        }),
      );
      dataOf(await updateMyPhone('010-0000-0003'));
      dataOf(await setFavorite({ shopId: shop.shopId, favorite: true, ...intruder }));

      expect(await profileOf(tx, b.customerId)).toEqual({
        name: '비',
        nickname: '비 닉네임',
        phone: '010-0000-0003',
      });
      expect(await favoriteShopsOf(tx, b.customerId)).toEqual([shop.shopId]);
      expect(await profileOf(tx, a.customerId)).toEqual(aBefore);
      expect(await favoriteShopsOf(tx, a.customerId)).toEqual([]);
    });
  });

  it('로그인하지 않았거나 원장님 모드면 내 예약 상세를 열 수 없고 내 정보도 저장되지 않는다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const booked = await bookSlot(tx, { shop, customer: a, ...SLOT_TIMES, ...A_BOOKING });
      const aBefore = await profileOf(tx, a.customerId);
      const change = { name: '바꿈', nickname: '바꿈', phone: '010-0000-0004' };

      // 로그인 안 함
      flow.account = null;
      const unauthenticated = { ok: false, error: { code: 'UNAUTHENTICATED' } };
      expect(await getMyReservationDetail(booked.reservationId)).toMatchObject(unauthenticated);
      expect(await updateMyProfile(change)).toMatchObject(unauthenticated);

      // 원장님 모드(그 샵 원장님): 원장님 계정으로는 고객 화면의 예약을 보거나 고객 정보를 고칠 수 없다(X-101)
      signIn(shop.createdBy, 'owner');
      const wrongMode = { ok: false, error: { code: 'WRONG_MODE' } };
      expect(await getMyReservationDetail(booked.reservationId)).toMatchObject(wrongMode);
      expect(await updateMyProfile(change)).toMatchObject(wrongMode);

      expect(await profileOf(tx, a.customerId)).toEqual(aBefore);
    });
  });
});
