// FLOW-03 합의 후 취소(docs/test-scenarios.md 16장): 원장님 요청 → 손님 알림 → 동의 → 결제액 50% 환불·예약 취소,
// 거절과 24시간 만료는 예약 그대로.
// 회귀 테스트 ②(서버 흐름): 화면이 부르는 실제 서버 함수를 테스트 DB에서 차례로 부르고, 바깥 서비스와 시각만 가짜(./fakes.ts)로 바꾼다.
// 손님 예약까지는 FLOW-01과 같은 실제 결제 흐름이다(./booking.ts). 기댓값은 규칙 문서의 숫자와 문장 그대로다.
// - 금액: docs/settlement-examples.md "오픈 기간, 손님과 합의 후 취소한 경우"의 쿠폰 없음 열
//   (10% 할인 매물 결제 45,000원 → 손님 환불 22,500원, 카드에 남은 돈 22,500원)
// - 24시간 안에 답하지 않으면 예약은 그대로, 거절해도 그대로, 원장님은 다시 요청할 수 있다: CLAUDE.md 핵심 규칙(S-410, X-208, #301)
// - 합의 후 취소에는 재등록 안내(S-400)를 보내지 않는다: X-208

import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import { getDb } from '@/db';
import { agreedCancelRequests, refunds, reservations, slots } from '@/db/schema';
import {
  getAgreedCancelRequest,
  requestAgreedCancel,
  respondAgreedCancel,
} from '@/server/refunds/agreed-cancel';
import { sweepAgreedCancelRequests } from '@/server/refunds/agreed-cancel-expiry';
import { AGREED_CANCEL_REASON } from '@/server/refunds/refund-payment';

import { createTestCustomer, createTestShop } from '../db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../db/test-db';
import { bookSlot, enablePush } from './booking';
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

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

/** 서비스는 11/5(목) 15:00~16:00. 게시는 시작 48시간 전(S-204), 손님은 11/3에 예약했다 */
const TIMES = {
  startAt: kst('2026-11-05T15:00:00'),
  endAt: kst('2026-11-05T16:00:00'),
  publishAt: kst('2026-11-03T15:00:00'),
  browseAt: kst('2026-11-03T16:00:00'),
  paidAt: kst('2026-11-03T16:05:00'),
};
/** 원장님이 합의 후 취소를 요청한 시각. 손님은 24시간 뒤(11/5 10:00)까지 답할 수 있다 */
const REQUEST_AT = kst('2026-11-04T10:00:00');

/** 입점 승인된 샵, 고객, 두 계정 모두 푸시 알림을 켠 기기, 그리고 손님이 예약한 매물 */
async function bookedReservation(tx: TestTx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  const customer = await createTestCustomer(tx);
  const customerDevice = await enablePush(tx, customer.userId, 'customer');
  const ownerDevice = await enablePush(tx, shop.createdBy, 'owner');
  const booked = await bookSlot(tx, { shop, customer, ...TIMES });
  return { shop, customer, customerDevice, ownerDevice, booked };
}

/** 그 예약과 매물의 지금 상태 */
async function reservationState(tx: TestTx, reservationId: string) {
  const [row] = await tx
    .select({
      reservation: reservations.status,
      cancelActor: reservations.cancelActor,
      slot: slots.status,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .where(eq(reservations.id, reservationId));
  return row;
}

/** 그 예약의 합의 후 취소 요청들(요청한 순서) */
async function requestStatuses(tx: TestTx, reservationId: string) {
  const rows = await tx
    .select({ status: agreedCancelRequests.status })
    .from(agreedCancelRequests)
    .where(eq(agreedCancelRequests.reservationId, reservationId))
    .orderBy(asc(agreedCancelRequests.requestedAt));
  return rows.map((row) => row.status);
}

describeDb('FLOW-03 합의 후 취소 (서버 흐름, 실제 DB)', () => {
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

  it('원장님 요청 → 손님 알림 → 동의 → 결제액 50% 환불·예약 취소, 원장님에게 동의 알림(재등록 안내 없음)', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const { shop, customer, customerDevice, ownerDevice, booked } = await bookedReservation(tx);
      const { reservationId } = booked;

      // 1. 원장님 예약 상세 [예약 취소] → "손님과 합의 후 취소": 손님은 24시간 안에 답할 수 있다
      flow.now = REQUEST_AT;
      signIn(shop.createdBy, 'owner');
      const requested = dataOf(
        await requestAgreedCancel({ reservationId, reason: 'style_mismatch' }),
      );
      expect(requested).toEqual({
        requestId: expect.any(String),
        requestedAt: REQUEST_AT.toISOString(),
        expiresAt: kst('2026-11-05T10:00:00').toISOString(),
      });

      // 2. 손님에게만 알림이 가고, 누르면 내 예약 상세가 열린다
      await runAfterTasks();
      expect(flow.pushes).toEqual([
        expect.objectContaining({
          endpoint: customerDevice,
          account: 'customer',
          title: '원장님이 합의 후 취소를 요청했어요',
          url: `/reservations/${reservationId}`,
        }),
      ]);
      flow.pushes = [];

      // 3. 손님 내 예약 상세의 요청 카드: 결제액 45,000원의 50%인 22,500원을 돌려받는다
      flow.now = kst('2026-11-04T12:00:00');
      signIn(customer.userId, 'customer');
      expect(dataOf(await getAgreedCancelRequest(reservationId))).toMatchObject({
        requestId: requested.requestId,
        reason: 'style_mismatch',
        paidAmount: 45000,
        couponAmount: 0,
        refundAmount: 22500,
        expiresAt: requested.expiresAt,
      });

      // 4. [동의하고 취소할게요]: 포트원에는 환불액만 부분 취소한다(잔액 45,000원을 같이 보내 두 번 환불되지 않게)
      const agreed = dataOf(
        await respondAgreedCancel({ requestId: requested.requestId, agree: true }),
      );
      expect(agreed).toEqual({
        agreed: true,
        reservationId,
        refundAmount: 22500,
        cancelledAt: flow.now.toISOString(),
      });
      expect(flow.cancels).toEqual([
        {
          paymentId: booked.paymentId,
          reason: AGREED_CANCEL_REASON,
          amount: 22500,
          currentCancellableAmount: 45000,
        },
      ]);
      expect(await reservationState(tx, reservationId)).toEqual({
        reservation: 'cancelled',
        cancelActor: 'agreed',
        slot: 'cancelled',
      });
      expect(await requestStatuses(tx, reservationId)).toEqual(['agreed']);
      const [refund] = await tx
        .select({
          reason: refunds.reason,
          status: refunds.status,
          penaltyRate: refunds.penaltyRate,
          refundAmount: refunds.refundAmount,
          penaltyAmount: refunds.penaltyAmount,
        })
        .from(refunds)
        .where(eq(refunds.reservationId, reservationId));
      expect(refund).toEqual({
        reason: 'agreed_cancel',
        status: 'done',
        penaltyRate: 50,
        refundAmount: 22500,
        penaltyAmount: 22500,
      });

      // 5. 원장님에게 동의 알림 하나만 가고(재등록 안내 없음), 누르면 원장님 예약 상세가 열린다
      await runAfterTasks();
      expect(flow.pushes).toEqual([
        expect.objectContaining({
          endpoint: ownerDevice,
          account: 'owner',
          title: '손님이 합의 후 취소에 동의했어요',
          url: `/owner/reservations/${reservationId}`,
        }),
      ]);

      // 6. 손님 요청 카드는 사라진다
      expect(dataOf(await getAgreedCancelRequest(reservationId))).toBeNull();
    });
  });

  it('손님이 거절하면 예약은 그대로이고, 원장님이 다시 요청한 뒤 24시간 안에 답이 없으면 만료돼 예약은 그대로다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      const { shop, customer, customerDevice, ownerDevice, booked } = await bookedReservation(tx);
      const { reservationId } = booked;
      const asOwner = () => signIn(shop.createdBy, 'owner');
      const asCustomer = () => signIn(customer.userId, 'customer');

      // 1. 원장님이 요청하고 손님이 [동의하지 않아요]
      flow.now = REQUEST_AT;
      asOwner();
      const first = dataOf(
        await requestAgreedCancel({ reservationId, reason: 'customer_declined' }),
      );
      await runAfterTasks();
      flow.pushes = [];
      flow.now = kst('2026-11-04T11:00:00');
      asCustomer();
      expect(
        dataOf(await respondAgreedCancel({ requestId: first.requestId, agree: false })),
      ).toEqual({ agreed: false, reservationId, declinedAt: flow.now.toISOString() });

      // 2. 원장님에게 거절 알림이 가고, 예약은 그대로다
      await runAfterTasks();
      expect(flow.pushes).toEqual([
        expect.objectContaining({
          endpoint: ownerDevice,
          account: 'owner',
          title: '손님이 합의 후 취소에 동의하지 않았어요',
          url: `/owner/reservations/${reservationId}`,
        }),
      ]);
      flow.pushes = [];
      expect(await reservationState(tx, reservationId)).toEqual({
        reservation: 'confirmed',
        cancelActor: null,
        slot: 'reserved',
      });

      // 3. 거절된 뒤에는 원장님이 다시 요청할 수 있다(횟수 제한 없음). 손님에게 다시 알림이 간다
      flow.now = kst('2026-11-04T12:00:00');
      asOwner();
      const second = dataOf(
        await requestAgreedCancel({ reservationId, reason: 'customer_declined' }),
      );
      expect(second.expiresAt).toBe(kst('2026-11-05T12:00:00').toISOString());
      await runAfterTasks();
      expect(flow.pushes).toEqual([
        expect.objectContaining({ endpoint: customerDevice, account: 'customer' }),
      ]);
      flow.pushes = [];

      // 4. 24시간이 지나면(정리 작업이 돌기 전이라도) 손님은 답할 수 없고 요청 카드도 사라진다
      flow.now = kst('2026-11-05T12:00:00');
      asCustomer();
      const late = await respondAgreedCancel({ requestId: second.requestId, agree: true });
      expect(late).toMatchObject({ ok: false, error: { code: 'REQUEST_EXPIRED' } });
      expect(dataOf(await getAgreedCancelRequest(reservationId))).toBeNull();

      // 5. 5분마다 도는 정리 작업이 요청을 만료로 바꾸고 원장님에게 알린다
      flow.now = kst('2026-11-05T12:05:00');
      expect(await sweepAgreedCancelRequests(getDb(), flow.now)).toEqual({
        expired: 1,
        closed: 0,
        failed: 0,
      });
      expect(flow.pushes).toEqual([
        expect.objectContaining({
          endpoint: ownerDevice,
          account: 'owner',
          title: '합의 후 취소 요청이 만료됐어요',
          url: `/owner/reservations/${reservationId}`,
        }),
      ]);

      // 6. 예약은 그대로이고, 돈은 한 번도 돌려주지 않았다
      expect(await requestStatuses(tx, reservationId)).toEqual(['declined', 'expired']);
      expect(await reservationState(tx, reservationId)).toEqual({
        reservation: 'confirmed',
        cancelActor: null,
        slot: 'reserved',
      });
      expect(flow.cancels).toEqual([]);
      expect(
        await tx
          .select({ id: refunds.id })
          .from(refunds)
          .where(eq(refunds.reservationId, reservationId)),
      ).toEqual([]);
    });
  });
});
