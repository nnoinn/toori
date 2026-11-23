// FLOW-02 원장님 한 바퀴(docs/test-scenarios.md 16장): 가입·입점 신청 → 운영자 승인 → 매물 등록(게시예정·게시중) → 대시보드
// → 예약 → 시작 뒤 방문·노쇼 처리 → 매물 완료.
// 회귀 테스트 ②(서버 흐름): 화면이 부르는 실제 서버 함수를 테스트 DB에서 차례로 부르고, 바깥 서비스와 시각만 가짜(./fakes.ts)로 바꾼다.
// 이 흐름에만 있는 바깥 서비스(카카오 주소 변환)와 화면 새로 읽기(next/cache)는 이 파일에서 가짜로 바꾼다.
// 대시보드는 화면(src/app/owner/(console)/page.tsx)이 부르는 조회와 상태 계산(viewStatus)을 그대로 부른다.
// 손님 결제는 FLOW-01과 같은 실제 결제 흐름이다(./booking.ts).
// 기댓값은 CLAUDE.md 핵심 규칙 그대로다.
// - 입점 승인 뒤에만 매물을 등록할 수 있다(S-102, A-101)
// - 매물은 서비스 시작 48시간 전부터 게시한다(S-204). 48시간보다 멀면 게시예정으로 두고, 48시간 안이면 바로 게시중
// - 할인가 = 정가 × (1 − 할인율). 50,000원 10% → 45,000원(S-203)
// - 방문·노쇼는 서비스 시작 뒤에만 처리한다(S-405). 노쇼는 매물 상태가 아니고, 매물은 '완료', 노쇼 여부는 예약에 기록한다

import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import { approveShopAction } from '@/app/admin/shops/[shopId]/actions';
import { viewStatus } from '@/app/owner/(console)/dashboard/dashboard';
import {
  selectDashboardSlots,
  selectNeedsVisitRecord,
} from '@/app/owner/(console)/dashboard/dashboard-store';
import { saveMenu } from '@/app/owner/(console)/settings/menu/actions';
import { createSlot } from '@/app/owner/(console)/slots/new/actions';
import { getDb } from '@/db';
import { menus, profiles, reservations, slots } from '@/db/schema';
import { startOfKstDay } from '@/lib/time';
import { createOwnerAccount } from '@/server/auth/owner-account';
import { listMyNotifications } from '@/server/notifications/inbox';
import { holdSlot } from '@/server/payments/checkout';
import { getShopReviewStatus } from '@/server/shops/review';
import { recordVisit } from '@/server/visits/record-visit';

import { createTestCustomer, createTestUser } from '../db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../db/test-db';
import { payHeldSlot } from './booking';
import { dataOf, flow, resetFlow, runAfterTasks, signIn } from './fakes';

vi.mock('@/db', async () => (await import('./fakes')).fakeDb);
vi.mock('@/lib/request-time', async () => (await import('./fakes')).fakeRequestTime);
vi.mock('@/server/supabase/server', async () => (await import('./fakes')).fakeSupabase);
vi.mock('next/headers', async () => (await import('./fakes')).fakeNextHeaders);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  ...(await import('./fakes')).fakeNextServer,
}));
vi.mock('@/server/payments/portone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payments/portone')>()),
  ...(await import('./fakes')).fakePortOne,
}));
vi.mock('@/server/notifications/send-web-push', async () => (await import('./fakes')).fakeWebPush);
// 저장한 뒤 화면을 새로 읽게 하는 도구는 요청이 있어야 돌아서 아무것도 하지 않게 한다
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  refresh: () => {},
  revalidatePath: () => {},
}));
// 카카오 주소 변환(바깥 서비스). 가입 때 적은 도로명 주소를 안산시 단원구 좌표로 돌려준다
vi.mock('@/features/map/geocode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/map/geocode')>()),
  geocodeAddress: async (roadAddress: string) => ({
    ok: true,
    data: {
      roadAddress,
      jibunAddress: null,
      lat: 37.3189,
      lng: 126.8386,
      region: { sido: '경기', sigungu: '안산시 단원구', sigunguCode: '41273' },
    },
  }),
}));

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

/** 원장님이 가입·입점 신청한 시각(11/2 월) */
const JOIN_AT = kst('2026-11-02T10:00:00');
/** 운영자가 입점을 승인한 시각 */
const APPROVE_AT = kst('2026-11-02T11:00:00');
/** 원장님이 메뉴를 올리고 매물 두 개를 올린 시각 */
const LIST_AT = kst('2026-11-02T12:00:00');
/**
 * 매물 A: 11/5(목) 15:00~16:00. 시작까지 48시간보다 멀어서 게시예정이고, 시작 48시간 전(11/3 15:00)에 게시된다.
 * 매물 B: 11/3(화) 18:00~19:00. 시작까지 30시간이라 바로 게시중이다
 */
const A_START = kst('2026-11-05T15:00:00');
const A_PUBLISH = kst('2026-11-03T15:00:00');
const B_START = kst('2026-11-03T18:00:00');
/** 손님 1이 A(아직 게시예정)와 B를 누르고 B를 결제한 시각 */
const FIRST_BROWSE = kst('2026-11-02T13:00:00');
const FIRST_PAID = kst('2026-11-02T13:05:00');
/** A가 게시된 뒤 손님 2가 A를 누르고 결제한 시각 */
const SECOND_BROWSE = kst('2026-11-03T16:00:00');
const SECOND_PAID = kst('2026-11-03T16:05:00');
/** B 시작 전에 방문 처리를 눌러 본 시각 */
const BEFORE_B_START = kst('2026-11-03T17:30:00');
/** B가 끝난 뒤 방문 완료로 처리한 시각 */
const B_VISIT_AT = kst('2026-11-03T19:30:00');
/** A가 끝난 뒤 노쇼로 처리한 시각 */
const A_NO_SHOW_AT = kst('2026-11-05T16:30:00');

/** 운영자 계정(운영자 입구로 로그인한다) */
async function createAdmin(tx: TestTx) {
  const userId = await createTestUser(tx);
  await tx.update(profiles).set({ isAdmin: true }).where(eq(profiles.id, userId));
  return userId;
}

describeDb('FLOW-02 원장님 한 바퀴 (서버 흐름, 실제 DB)', () => {
  beforeEach(() => {
    resetFlow();
    // 결제 시작은 포트원 상점 값이 있어야 결제창 값을 돌려준다. 가짜 값이고 포트원은 부르지 않는다
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store-flow-test');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'channel-flow-test');
    // 가입 때 정산 계좌번호를 암호화해서 저장한다. 테스트용 가짜 키(32바이트)
    vi.stubEnv('PAYOUT_ACCOUNT_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(closeTestDb);

  it('가입·입점 신청 → 운영자 승인 → 매물 등록(게시예정·게시중) → 예약 → 시작 뒤 방문·노쇼 처리 → 매물 완료', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const ownerUserId = await createTestUser(tx);
      const adminId = await createAdmin(tx);
      const firstCustomer = await createTestCustomer(tx);
      const secondCustomer = await createTestCustomer(tx);

      /** 원장님 대시보드(화면과 같은 조회): 오늘 0시 이후 매물의 화면 상태 */
      const dashboard = async (shopId: string) => {
        const now = flow.now;
        const rows = await selectDashboardSlots(getDb(), shopId, startOfKstDay(now));
        return Object.fromEntries(rows.map((row) => [row.id, viewStatus(row, now)]));
      };
      /** 대시보드 "처리 필요": 시작이 지났는데 방문·노쇼를 기록하지 않은 예약의 매물 */
      const needsVisit = async (shopId: string) =>
        (await selectNeedsVisitRecord(getDb(), shopId, flow.now)).map((row) => row.id);
      /** 원장님 알림함 */
      const ownerInbox = async () => {
        signIn(ownerUserId, 'owner');
        return dataOf(await listMyNotifications(undefined, 'owner')).items.map((item) => ({
          title: item.title,
          url: item.url,
        }));
      };

      // 1. 원장님 가입·입점 신청: 원장님 정보, 사업자 정보·등록증, 샵, 정산 계좌, 필수 약관 동의를 한 번에 낸다
      flow.now = JOIN_AT;
      signIn(ownerUserId, 'owner');
      const joined = dataOf(
        await createOwnerAccount({
          owner: { name: '김원장', phone: '010-0000-0001' },
          shop: {
            businessName: '흐름 테스트 헤어',
            representativeName: '김원장',
            businessRegistrationNumber: '123-45-67891',
            openedOn: '2024-03-01',
            businessDocPath: `users/${ownerUserId}/${crypto.randomUUID()}.jpg`,
            name: '흐름 테스트 헤어 안산점',
            category: 'hair',
            phone: '010-0000-0002',
            roadAddress: '경기 안산시 단원구 중앙대로 1',
          },
          payout: { bankCode: '088', accountNumber: '110-123-456789', accountHolder: '김원장' },
          agreements: { supplier: true, privacy: true, payoutInfo: true },
        }),
      );
      const { shopId } = joined;

      // 2. 승인 전: 원장님 화면은 승인 대기 안내이고, 매물을 올릴 수 없다(S-102).
      //    신청·승인 시각은 DB 시각(now())으로 남아서 여기서 정한 서버 시각과 다르니 상태만 본다
      expect(dataOf(await getShopReviewStatus(shopId))).toMatchObject({
        status: 'pending',
        reviewedAt: null,
      });
      expect(
        await createSlot(shopId, {
          menuId: crypto.randomUUID(),
          startAt: A_START.toISOString(),
          discountRate: 10,
          newCustomerOnly: false,
        }),
      ).toMatchObject({ ok: false, error: { code: 'SHOP_NOT_APPROVED' } });

      // 3. 운영자가 입점을 승인하면 원장님 알림함에 승인 알림이 온다
      flow.now = APPROVE_AT;
      signIn(adminId, 'admin');
      expect(await approveShopAction(shopId)).toEqual({ ok: true, data: null });
      await runAfterTasks();
      signIn(ownerUserId, 'owner');
      expect(dataOf(await getShopReviewStatus(shopId))).toMatchObject({
        status: 'approved',
        reviewedAt: expect.any(Date),
      });
      expect(await ownerInbox()).toEqual([expect.objectContaining({ title: '입점이 승인됐어요' })]);

      // 4. 메뉴(여성 커트 50,000원, 1시간)를 올리고, 그 메뉴로 10% 할인 매물 두 개를 올린다
      flow.now = LIST_AT;
      expect(
        await saveMenu(shopId, null, {
          serviceType: 'cut',
          name: '여성 커트',
          listPrice: '50,000',
          durationMinutes: 60,
          description: '',
        }),
      ).toEqual({ ok: true });
      const [menu] = await tx.select({ id: menus.id }).from(menus).where(eq(menus.shopId, shopId));
      const register = async (startAt: Date) =>
        dataOf(
          await createSlot(shopId, {
            menuId: menu.id,
            startAt: startAt.toISOString(),
            discountRate: 10,
            newCustomerOnly: false,
          }),
        );
      const slotA = await register(A_START);
      const slotB = await register(B_START);
      // A는 시작 48시간 전(11/3 15:00)에 게시되는 게시예정, B는 바로 게시중(게시 시각 안내 없음)
      expect(slotA).toEqual({
        slotId: expect.any(String),
        salePrice: 45000,
        publishAt: A_PUBLISH.toISOString(),
      });
      expect(slotB).toEqual({ slotId: expect.any(String), salePrice: 45000, publishAt: null });
      expect(await dashboard(shopId)).toEqual({
        [slotA.slotId]: 'scheduled',
        [slotB.slotId]: 'published',
      });

      // 5. 손님 1: 게시 전인 A는 [예약하기]가 막히고, B를 홀딩해 결제한다. 원장님에게 새 예약 알림이 온다
      flow.now = FIRST_BROWSE;
      signIn(firstCustomer.userId, 'customer');
      expect(await holdSlot(slotA.slotId)).toMatchObject({
        ok: false,
        error: { code: 'SLOT_NOT_AVAILABLE' },
      });
      dataOf(await holdSlot(slotB.slotId));
      const bookedB = await payHeldSlot(tx, {
        customerId: firstCustomer.customerId,
        slotId: slotB.slotId,
        paidAt: FIRST_PAID,
      });
      const inbox = await ownerInbox();
      expect(inbox).toHaveLength(2);
      expect(inbox).toContainEqual({
        title: '새 예약이 들어왔어요',
        url: `/owner/reservations/${bookedB.reservationId}`,
      });

      // 6. A가 게시된 뒤 손님 2가 A를 예약한다. 대시보드에는 둘 다 예약됨
      flow.now = SECOND_BROWSE;
      signIn(secondCustomer.userId, 'customer');
      dataOf(await holdSlot(slotA.slotId));
      const bookedA = await payHeldSlot(tx, {
        customerId: secondCustomer.customerId,
        slotId: slotA.slotId,
        paidAt: SECOND_PAID,
      });
      signIn(ownerUserId, 'owner');
      expect(await dashboard(shopId)).toEqual({
        [slotA.slotId]: 'reserved',
        [slotB.slotId]: 'reserved',
      });

      // 7. B 시작 전에는 방문 처리를 할 수 없다(S-405)
      flow.now = BEFORE_B_START;
      expect(
        await recordVisit({ reservationId: bookedB.reservationId, result: 'visited' }),
      ).toMatchObject({ ok: false, error: { code: 'TOO_EARLY' } });
      expect(await needsVisit(shopId)).toEqual([]);

      // 8. B가 끝나면 "처리 필요"에 오르고, 방문 완료로 처리하면 B는 완료가 되고 목록에서 빠진다
      flow.now = B_VISIT_AT;
      expect(await needsVisit(shopId)).toEqual([slotB.slotId]);
      dataOf(await recordVisit({ reservationId: bookedB.reservationId, result: 'visited' }));
      expect(await needsVisit(shopId)).toEqual([]);
      expect(await dashboard(shopId)).toEqual({
        [slotA.slotId]: 'reserved',
        [slotB.slotId]: 'completed',
      });

      // 9. A가 끝나고 손님이 오지 않아 노쇼로 처리하면, A도 매물은 완료이고 노쇼는 예약에 남는다(S-405·S-406)
      flow.now = A_NO_SHOW_AT;
      expect(await needsVisit(shopId)).toEqual([slotA.slotId]);
      dataOf(await recordVisit({ reservationId: bookedA.reservationId, result: 'no_show' }));
      expect(await needsVisit(shopId)).toEqual([]);
      expect(await dashboard(shopId)).toEqual({ [slotA.slotId]: 'completed' });

      const savedSlots = await tx
        .select({ id: slots.id, status: slots.status })
        .from(slots)
        .where(inArray(slots.id, [slotA.slotId, slotB.slotId]));
      expect(savedSlots).toEqual(
        expect.arrayContaining([
          { id: slotA.slotId, status: 'completed' },
          { id: slotB.slotId, status: 'completed' },
        ]),
      );
      const savedReservations = await tx
        .select({
          id: reservations.id,
          status: reservations.status,
          visitResult: reservations.visitResult,
        })
        .from(reservations)
        .where(inArray(reservations.id, [bookedA.reservationId, bookedB.reservationId]));
      expect(savedReservations).toEqual(
        expect.arrayContaining([
          { id: bookedB.reservationId, status: 'completed', visitResult: 'visited' },
          { id: bookedA.reservationId, status: 'completed', visitResult: 'no_show' },
        ]),
      );
    });
  });
});
