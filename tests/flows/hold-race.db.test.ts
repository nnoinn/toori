// FLOW-04 홀딩 경쟁(docs/test-scenarios.md 16장): 두 손님이 같은 매물을 누르면 한 명만 홀딩되고, 다른 손님에게는 "결제 중"이 보이며,
// 10분이 지나면 다른 손님이 홀딩할 수 있다. 한 사람은 동시에 하나만 홀딩한다.
// 회귀 테스트 ②(서버 흐름): 화면이 부르는 실제 서버 함수를 테스트 DB에서 차례로 부르고, 바깥 서비스와 시각만 가짜(./fakes.ts)로 바꾼다.
// 손님은 한 명씩 차례로 누른다(로그인한 사람을 바꿔 가며). 같은 순간에 누르는 경쟁은 HOLD-02(hold-concurrency.db.test.ts)가 본다.
// 기댓값은 규칙 문서 그대로다.
// - 10분 홀딩, 홀딩 중에는 다른 고객이 결제할 수 없고 10분 안에 결제를 마친 한 명만 예약 확정, 한 사람은 동시에 1개만,
//   홀딩 중인 매물은 목록에 그대로 두되 "다른 고객이 결제 중"으로 표시: CLAUDE.md 핵심 규칙(C-404, X-304)
// - 홀딩은 만료 시각과 같거나 지나면 풀린다: docs/test-scenarios.md HOLD-04

import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import { getMyReservations } from '@/app/(customer)/(tabs)/reservations/queries';
import { selectSlotDetail } from '@/app/(customer)/(tabs)/slots/[slotId]/queries';
import { getDb } from '@/db';
import { loadHomeSlots } from '@/features/map/slot-list/actions';
import { getMyActiveHold, holdSlot, releaseHold, startPayment } from '@/server/payments/checkout';

import { createTestCustomer, createTestShop, TEST_LOCATION } from '../db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../db/test-db';
import { payHeldSlot, publishSlot } from './booking';
import { dataOf, flow, resetFlow, signIn } from './fakes';

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

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

/** 서비스는 11/5(목) 15:00~16:00(시작 29시간 전이라 임박·환불 불가 배지는 없다). 게시는 시작 48시간 전(S-204) */
const SLOT_TIMES = {
  startAt: kst('2026-11-05T15:00:00'),
  endAt: kst('2026-11-05T16:00:00'),
  publishAt: kst('2026-11-03T15:00:00'),
};
/** 같은 샵의 다른 매물(17:00~18:00). 한 사람 하나(③)에 쓴다 */
const OTHER_SLOT_TIMES = {
  startAt: kst('2026-11-05T17:00:00'),
  endAt: kst('2026-11-05T18:00:00'),
  publishAt: kst('2026-11-03T17:00:00'),
};
/** 손님 A가 [예약하기]를 누른 시각. 홀딩은 10분 뒤 10:10:00에 끝난다 */
const A_PRESSED_AT = kst('2026-11-04T10:00:00');
const A_HOLD_ENDS_AT = kst('2026-11-04T10:10:00');

/** 샵(안산시청 근처)이 들어가는 지도 영역 */
const BOUNDS = {
  sw: { lat: TEST_LOCATION.lat - 0.01, lng: TEST_LOCATION.lng - 0.01 },
  ne: { lat: TEST_LOCATION.lat + 0.01, lng: TEST_LOCATION.lng + 0.01 },
};

type Customer = { userId: string; customerId: string };

/** 이 손님으로 로그인해서 지도 목록에서 샵 마커를 눌렀을 때 보이는 그 매물 한 줄 */
async function listRow(customer: Customer, shopId: string, slotId: string) {
  signIn(customer.userId, 'customer');
  const list = dataOf(await loadHomeSlots({ bounds: BOUNDS, search: '', cursor: null, shopId }));
  return list.items.find((item) => item.kind === 'slot' && item.slotId === slotId);
}

/** 이 손님이 보는 상세의 예약 가능 여부(available 예약하기 / mine 내가 결제 중 / onHold 다른 고객이 결제 중 / closed 예약할 수 없음) */
async function detailOf(customer: Customer, slotId: string) {
  signIn(customer.userId, 'customer');
  const detail = await selectSlotDetail(getDb(), {
    slotId,
    customerId: customer.customerId,
    now: flow.now,
  });
  return detail?.availability;
}

/** 이 손님의 결제 중 막대(지금 내 홀딩)에 보이는 매물. 없으면 null */
async function holdBarOf(customer: Customer) {
  signIn(customer.userId, 'customer');
  const hold = dataOf(await getMyActiveHold());
  return hold ? { slotId: hold.slotId, holdExpiresAt: hold.holdExpiresAt } : null;
}

describeDb('FLOW-04 홀딩 경쟁 (서버 흐름, 실제 DB)', () => {
  beforeEach(() => {
    resetFlow();
    // 결제 시작은 포트원 상점 값이 있어야 결제창 값을 돌려준다. 가짜 값이고 포트원은 부르지 않는다
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store-flow-test');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'channel-flow-test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterAll(closeTestDb);

  it('두 손님이 같은 매물을 누르면 한 명만 홀딩되고, 다른 손님에게는 목록과 상세에 "결제 중"이 보이며 결제할 수 없다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const slotId = await publishSlot(tx, shop, SLOT_TIMES);

      // 1. 손님 A가 [예약하기]: 서버 시각으로 10분 홀딩
      flow.now = A_PRESSED_AT;
      signIn(a.userId, 'customer');
      expect(dataOf(await holdSlot(slotId))).toMatchObject({
        slotId,
        holdExpiresAt: A_HOLD_ENDS_AT.toISOString(),
      });

      // 2. 1분 뒤 손님 B: 매물은 목록에 그대로 있고 "다른 고객이 결제 중" 배지, 상세도 "다른 고객이 결제 중"
      flow.now = kst('2026-11-04T10:01:00');
      expect(await listRow(b, shop.shopId, slotId)).toMatchObject({ badges: ['onHold'] });
      expect(await detailOf(b, slotId)).toBe('onHold');

      // 3. B가 [예약하기]를 눌러도 홀딩되지 않고, 결제도 시작할 수 없다. B에게는 결제 중 막대가 없다
      signIn(b.userId, 'customer');
      expect(await holdSlot(slotId)).toMatchObject({ ok: false, error: { code: 'HELD_BY_OTHER' } });
      expect(
        await startPayment({ slotId, refundPolicyAgreed: true, bookerInfoAgreed: true }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_HOLDER' } });
      expect(await holdBarOf(b)).toBeNull();

      // 4. A에게는 "결제 중" 배지 없이 보이고, 상세는 "내가 결제 중", 결제 중 막대에 이 매물이 있다
      expect(await listRow(a, shop.shopId, slotId)).toMatchObject({ badges: [] });
      expect(await detailOf(a, slotId)).toBe('mine');
      expect(await holdBarOf(a)).toEqual({ slotId, holdExpiresAt: A_HOLD_ENDS_AT.toISOString() });
    });
  });

  it('10분이 지나면 다른 손님이 홀딩해 결제를 마친 한 명만 예약되고, 먼저 누른 손님은 결제할 수 없다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const slotId = await publishSlot(tx, shop, SLOT_TIMES);

      flow.now = A_PRESSED_AT;
      signIn(a.userId, 'customer');
      dataOf(await holdSlot(slotId));

      // 1. 9분 59초: 아직 A의 홀딩이라 B는 홀딩할 수 없다
      flow.now = kst('2026-11-04T10:09:59');
      signIn(b.userId, 'customer');
      expect(await holdSlot(slotId)).toMatchObject({ ok: false, error: { code: 'HELD_BY_OTHER' } });

      // 2. 딱 10분(만료 시각과 같음): A의 홀딩이 풀려 B의 목록·상세에서 "결제 중"이 사라지고, A의 결제 중 막대도 없다
      flow.now = A_HOLD_ENDS_AT;
      expect(await listRow(b, shop.shopId, slotId)).toMatchObject({ badges: [] });
      expect(await detailOf(b, slotId)).toBe('available');
      expect(await holdBarOf(a)).toBeNull();
      signIn(a.userId, 'customer');
      expect(
        await startPayment({ slotId, refundPolicyAgreed: true, bookerInfoAgreed: true }),
      ).toMatchObject({ ok: false, error: { code: 'HOLD_EXPIRED' } });

      // 3. B가 [예약하기]: 이번에는 B가 10분 홀딩. 이제 A에게 "결제 중"이 보이고 A는 홀딩도 결제도 할 수 없다
      signIn(b.userId, 'customer');
      expect(dataOf(await holdSlot(slotId))).toMatchObject({
        slotId,
        holdExpiresAt: kst('2026-11-04T10:20:00').toISOString(),
      });
      expect(await listRow(a, shop.shopId, slotId)).toMatchObject({ badges: ['onHold'] });
      expect(await detailOf(a, slotId)).toBe('onHold');
      signIn(a.userId, 'customer');
      expect(await holdSlot(slotId)).toMatchObject({ ok: false, error: { code: 'HELD_BY_OTHER' } });
      expect(
        await startPayment({ slotId, refundPolicyAgreed: true, bookerInfoAgreed: true }),
      ).toMatchObject({ ok: false, error: { code: 'NOT_HOLDER' } });

      // 4. B가 10분 안(10:15)에 결제를 마치면 예약이 확정된다. 예약은 B의 내 예약에만 있고, A의 상세는 "예약할 수 없음"
      signIn(b.userId, 'customer');
      const booked = await payHeldSlot(tx, {
        customerId: b.customerId,
        slotId,
        paidAt: kst('2026-11-04T10:15:00'),
      });
      expect(dataOf(await getMyReservations('upcoming'))).toEqual([
        expect.objectContaining({ reservationId: booked.reservationId }),
      ]);
      signIn(a.userId, 'customer');
      expect(dataOf(await getMyReservations('upcoming'))).toEqual([]);
      expect(await detailOf(a, slotId)).toBe('closed');
    });
  });

  it('한 손님은 동시에 매물 하나만 홀딩한다: 다른 매물은 지금 결제 중인 매물을 알려 주며 막고, 풀면 홀딩할 수 있다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const shop = await createTestShop(tx, { status: 'approved' });
      const a = await createTestCustomer(tx);
      const b = await createTestCustomer(tx);
      const first = await publishSlot(tx, shop, SLOT_TIMES);
      const second = await publishSlot(tx, shop, OTHER_SLOT_TIMES);

      // 1. A가 첫 매물을 홀딩한 채 두 번째 매물을 누르면 막히고, 지금 결제 중인 매물(첫 매물)을 알려 준다
      flow.now = A_PRESSED_AT;
      signIn(a.userId, 'customer');
      dataOf(await holdSlot(first));
      expect(await holdSlot(second)).toMatchObject({
        ok: false,
        error: { code: 'ALREADY_HOLDING', heldSlotId: first },
      });
      // 두 번째 매물은 아무도 홀딩하지 않았으므로 다른 손님에게 "결제 중"이 아니다
      expect(await listRow(b, shop.shopId, second)).toMatchObject({ badges: [] });

      // 2. A가 결제 중 막대에서 [취소]로 첫 매물을 풀면, 두 번째 매물을 홀딩할 수 있다
      flow.now = kst('2026-11-04T10:03:00');
      signIn(a.userId, 'customer');
      dataOf(await releaseHold(first));
      expect(dataOf(await holdSlot(second))).toMatchObject({
        slotId: second,
        holdExpiresAt: kst('2026-11-04T10:13:00').toISOString(),
      });
      expect(await holdBarOf(a)).toEqual({
        slotId: second,
        holdExpiresAt: kst('2026-11-04T10:13:00').toISOString(),
      });

      // 3. 푼 첫 매물은 바로 다른 손님이 홀딩할 수 있다
      expect(await listRow(b, shop.shopId, first)).toMatchObject({ badges: [] });
      signIn(b.userId, 'customer');
      expect(dataOf(await holdSlot(first))).toMatchObject({ slotId: first });
    });
  });
});
