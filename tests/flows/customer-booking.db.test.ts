// FLOW-01 손님 한 바퀴(docs/test-scenarios.md 16장): 목록 → 상세 → [예약하기] 10분 홀딩 → 결제 → 예약 확정 알림(손님·원장님)
// → 내 예약 → 30시간 전 취소 → 70% 환불, 원장님에게 재등록 안내.
// 회귀 테스트 ②(서버 흐름): 화면이 부르는 실제 서버 함수를 테스트 DB에서 차례로 부르고, 바깥 서비스와 시각만 가짜(./fakes.ts)로 바꾼다.
// 기댓값은 규칙 문서의 숫자와 문장 그대로다.
// - 홀딩 10분: CLAUDE.md 핵심 규칙(C-404)
// - 금액: docs/settlement-examples.md "오픈 기간, 고객이 30시간 전에 취소한 경우"의 쿠폰 없음 열
//   (10% 할인 매물 판매가 45,000원 결제 → 환불 31,500원, 카드에 남은 돈 13,500원)
// - 재등록 안내 문구: CLAUDE.md 핵심 규칙(S-400, S-408) "동일한 매물을 재등록하시겠습니까?"

import { eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';

import { getMyReservations } from '@/app/(customer)/(tabs)/reservations/queries';
import { selectSlotDetail } from '@/app/(customer)/(tabs)/slots/[slotId]/queries';
import { getDb } from '@/db';
import {
  customers,
  notifications,
  orders,
  pushSubscriptions,
  refunds,
  reservations,
  slots,
} from '@/db/schema';
import { loadHomeSlots } from '@/features/map/slot-list/actions';
import { confirmPayment, holdSlot, startPayment } from '@/server/payments/checkout';
import { cancelReservation, previewRefund } from '@/server/refunds/cancel';
import { CUSTOMER_CANCEL_REASON } from '@/server/refunds/refund-payment';

import { createTestCustomer, createTestShop, TEST_LOCATION, testSlot } from '../db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../db/test-db';
import {
  dataOf,
  flow,
  FLOW_ORIGIN,
  paidOnPortOne,
  resetFlow,
  runAfterTasks,
  signIn,
} from './fakes';

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

const MINUTE = 60 * 1000;
const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

/** 서비스는 11/3(화) 15:00~16:00. 게시는 시작 48시간 전(S-204) */
const START = kst('2026-11-03T15:00:00');
const END = kst('2026-11-03T16:00:00');
const PUBLISH_AT = kst('2026-11-01T15:00:00');
/** 손님이 목록을 보고 [예약하기]를 누른 시각 */
const BROWSE_AT = kst('2026-11-02T08:40:00');
/** 포트원 결제창에서 결제를 마친 시각(홀딩 10분 안) */
const PAID_AT = kst('2026-11-02T08:45:00');
/** 손님이 취소한 시각: 시작 30시간 전 */
const CANCEL_AT = kst('2026-11-02T09:00:00');

/** 샵(안산시청 근처)이 들어가는 지도 영역 */
const BOUNDS = {
  sw: { lat: TEST_LOCATION.lat - 0.01, lng: TEST_LOCATION.lng - 0.01 },
  ne: { lat: TEST_LOCATION.lat + 0.01, lng: TEST_LOCATION.lng + 0.01 },
};

describeDb('FLOW-01 손님 한 바퀴 (서버 흐름, 실제 DB)', () => {
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

  it('목록 → 상세 → 10분 홀딩 → 결제 → 확정 알림(손님·원장님) → 내 예약 → 30시간 전 취소 → 70% 환불, 원장님에게 재등록 안내', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;

      // 준비: 입점 승인된 샵, 휴대폰 번호를 넣은 고객, 두 계정 모두 푸시 알림을 켠 기기 하나씩
      const shop = await createTestShop(tx, { status: 'approved' });
      const customer = await createTestCustomer(tx);
      await tx
        .update(customers)
        .set({ phone: '010-0000-0000' })
        .where(eq(customers.id, customer.customerId));
      const customerDevice = `https://push.test/${crypto.randomUUID()}`;
      const ownerDevice = `https://push.test/${crypto.randomUUID()}`;
      await tx.insert(pushSubscriptions).values([
        {
          userId: customer.userId,
          accountType: 'customer',
          endpoint: customerDevice,
          p256dh: 'test-p256dh',
          auth: 'test-auth',
        },
        {
          userId: shop.createdBy,
          accountType: 'owner',
          endpoint: ownerDevice,
          p256dh: 'test-p256dh',
          auth: 'test-auth',
        },
      ]);
      const [slot] = await tx
        .insert(slots)
        .values(
          testSlot(shop, '15:00', '16:00', {
            startAt: START,
            endAt: END,
            publishAt: PUBLISH_AT,
            listPrice: 50000,
            discountRate: 10,
            salePrice: 45000,
          }),
        )
        .returning();

      // 1. 목록: 고객 계정으로 로그인해 지도 목록을 열고, 샵 마커를 눌러 그 샵의 매물만 본다
      flow.now = BROWSE_AT;
      signIn(customer.userId, 'customer');
      const list = dataOf(
        await loadHomeSlots({ bounds: BOUNDS, search: '', cursor: null, shopId: shop.shopId }),
      );
      expect(list.items).toEqual([
        expect.objectContaining({ kind: 'slot', slotId: slot.id, salePrice: 45000 }),
      ]);

      // 2. 상세: 예약할 수 있다
      const detail = await selectSlotDetail(getDb(), {
        slotId: slot.id,
        customerId: customer.customerId,
        now: flow.now,
      });
      expect(detail).toMatchObject({ slotId: slot.id, availability: 'available' });

      // 3. [예약하기]: 서버 시각 기준 10분 홀딩, 상세는 "내가 결제 중"
      const hold = dataOf(await holdSlot(slot.id));
      expect(hold).toEqual({
        slotId: slot.id,
        holdExpiresAt: new Date(BROWSE_AT.getTime() + 10 * MINUTE).toISOString(),
        serverNow: BROWSE_AT.toISOString(),
      });
      expect(
        await selectSlotDetail(getDb(), {
          slotId: slot.id,
          customerId: customer.customerId,
          now: flow.now,
        }),
      ).toMatchObject({ availability: 'mine' });

      // 4. 결제하기: 필수 동의 2개와 함께 결제 대기 주문을 만들고 결제창 값을 받는다(쿠폰 없음)
      const request = dataOf(
        await startPayment({ slotId: slot.id, refundPolicyAgreed: true, bookerInfoAgreed: true }),
      );
      expect(request).toMatchObject({
        totalAmount: 45000,
        currency: 'CURRENCY_KRW',
        redirectUrl: `${FLOW_ORIGIN}/payment/result`,
      });

      // 5. 결제창에서 결제를 마치고 돌아오면, 서버가 포트원에 물어 예약을 확정한다
      flow.now = PAID_AT;
      paidOnPortOne(request.paymentId, 45000, PAID_AT);
      const confirmed = dataOf(await confirmPayment({ paymentId: request.paymentId }));
      const booking = async () => {
        const [row] = await tx
          .select({
            reservation: reservations.status,
            cancelActor: reservations.cancelActor,
            hoursBeforeStart: reservations.hoursBeforeStartAtCancel,
            slot: slots.status,
          })
          .from(reservations)
          .innerJoin(slots, eq(slots.id, reservations.slotId))
          .where(eq(reservations.id, confirmed.reservationId));
        return row;
      };
      expect(await booking()).toEqual({
        reservation: 'confirmed',
        cancelActor: null,
        hoursBeforeStart: null,
        slot: 'reserved',
      });
      const [order] = await tx
        .select({ status: orders.status, amount: orders.amount, salePrice: orders.salePrice })
        .from(orders)
        .where(eq(orders.paymentId, request.paymentId));
      expect(order).toEqual({ status: 'confirmed', amount: 45000, salePrice: 45000 });

      // 6. 예약 확정 알림: 손님과 원장님에게 한 번씩, 누르면 각자의 예약 상세가 열린다
      await runAfterTasks();
      expect(flow.pushes).toHaveLength(2);
      expect(flow.pushes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            endpoint: customerDevice,
            account: 'customer',
            url: `/reservations/${confirmed.reservationId}`,
          }),
          expect.objectContaining({
            endpoint: ownerDevice,
            account: 'owner',
            url: `/owner/reservations/${confirmed.reservationId}`,
          }),
        ]),
      );
      const sent = await tx
        .select({ account: notifications.accountType, status: notifications.status })
        .from(notifications)
        .where(inArray(notifications.userId, [customer.userId, shop.createdBy]));
      expect(sent).toHaveLength(2);
      expect(sent).toEqual(
        expect.arrayContaining([
          { account: 'customer', status: 'sent' },
          { account: 'owner', status: 'sent' },
        ]),
      );

      // 7. 내 예약: 예정 탭에 결제액 그대로 보인다
      expect(dataOf(await getMyReservations('upcoming'))).toEqual([
        expect.objectContaining({
          reservationId: confirmed.reservationId,
          code: confirmed.reservationCode,
          amount: 45000,
        }),
      ]);

      // 8. 시작 30시간 전 취소: 위약금 30%, 환불 70%(결제액 45,000원 → 31,500원)
      flow.now = CANCEL_AT;
      flow.pushes = [];
      const preview = dataOf(await previewRefund(confirmed.reservationId));
      expect(preview).toMatchObject({
        refundable: true,
        band: 'over_24h',
        penaltyRate: 30,
        paidAmount: 45000,
        refundAmount: 31500,
        penaltyAmount: 13500,
      });
      const cancelled = dataOf(
        await cancelReservation({
          reservationId: confirmed.reservationId,
          expectedRefundAmount: preview.refundAmount,
        }),
      );
      expect(cancelled).toMatchObject({ refundAmount: 31500 });
      // 포트원에는 환불액만 부분 취소한다(잔액 45,000원을 같이 보내 두 번 환불되지 않게)
      expect(flow.cancels).toEqual([
        {
          paymentId: request.paymentId,
          reason: CUSTOMER_CANCEL_REASON,
          amount: 31500,
          currentCancellableAmount: 45000,
        },
      ]);
      expect(await booking()).toEqual({
        reservation: 'cancelled',
        cancelActor: 'customer',
        hoursBeforeStart: 30,
        slot: 'cancelled',
      });
      const [refund] = await tx
        .select({
          reason: refunds.reason,
          status: refunds.status,
          band: refunds.band,
          penaltyRate: refunds.penaltyRate,
          refundAmount: refunds.refundAmount,
          penaltyAmount: refunds.penaltyAmount,
        })
        .from(refunds)
        .where(eq(refunds.reservationId, confirmed.reservationId));
      expect(refund).toEqual({
        reason: 'customer_cancel',
        status: 'done',
        band: 'over_24h',
        penaltyRate: 30,
        refundAmount: 31500,
        penaltyAmount: 13500,
      });

      // 9. 원장님에게만 재등록 안내가 가고, 누르면 같은 조건으로 다시 올리는 화면이 열린다(직접 취소한 손님에게는 보내지 않는다)
      await runAfterTasks();
      expect(flow.pushes).toEqual([
        expect.objectContaining({
          endpoint: ownerDevice,
          account: 'owner',
          body: '동일한 매물을 재등록하시겠습니까?',
          url: `/owner/slots/${slot.id}/relist`,
        }),
      ]);

      // 10. 내 예약: 예정 탭에서 빠지고 취소 탭에 취소 시각과 함께 보인다
      expect(dataOf(await getMyReservations('upcoming'))).toEqual([]);
      expect(dataOf(await getMyReservations('cancelled'))).toEqual([
        expect.objectContaining({
          reservationId: confirmed.reservationId,
          cancelledAt: CANCEL_AT.toISOString(),
        }),
      ]);
    });
  });
});
