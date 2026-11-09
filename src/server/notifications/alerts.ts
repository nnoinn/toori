// 이벤트별 알림 (연결 #12, #131). 서버에서만 부른다. 문구와 눌렀을 때 열 주소는 #131 표와 같다.
// 응답을 보낸 뒤 보내서 결제·취소를 늦추지 않고, 실패해도 결제·취소 결과는 그대로다.

import 'server-only';

import { eq } from 'drizzle-orm';
import { after } from 'next/server';

import type { getDb } from '@/db';
import { customers, orders, owners, reservations, shops, slots } from '@/db/schema';
import { formatKst } from '@/lib/time';

import { notify } from './notify';

type Db = ReturnType<typeof getDb>;

function sendAfterResponse(event: string, send: () => Promise<void>) {
  after(async () => {
    try {
      await send();
    } catch (error) {
      console.error('[notify] 알림 실패:', event, error instanceof Error ? error.name : 'unknown');
    }
  });
}

/** 예약 하나의 알림에 쓰는 값. 고객 이름·전화번호는 읽지 않는다 */
async function readReservationAlert(db: Db, reservationId: string) {
  const [row] = await db
    .select({
      customerUserId: customers.userId,
      ownerUserId: owners.userId,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
      slotId: slots.id,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .where(eq(reservations.id, reservationId));
  return row ?? null;
}

/** 결제가 확정됐을 때 고객과 원장님에게(C-602, S-404). 결제 확인·웹훅·정리 작업이 같은 예약으로 불러도 한 번만 간다 */
export function notifyReservationConfirmed(db: Db, reservationId: string) {
  const event = 'reservation.confirmed';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    const when = formatKst(alert.startAt);
    await Promise.all([
      notify(db, {
        userId: alert.customerUserId,
        accountType: 'customer',
        event,
        dedupeKey: `${event}:customer:${reservationId}`,
        title: '예약이 확정됐어요',
        body: `${alert.shopName} · ${when}`,
        url: `/reservations/${reservationId}`,
      }),
      notify(db, {
        userId: alert.ownerUserId,
        accountType: 'owner',
        event,
        dedupeKey: `${event}:owner:${reservationId}`,
        title: '새 예약이 들어왔어요',
        body: `${alert.menuName} · ${when}`,
        url: `/owner/reservations/${reservationId}`,
      }),
    ]);
  });
}

/**
 * 예약 취소가 끝났을 때 원장님에게(S-400, S-408). 고객 취소와 앱을 거치지 않은 운영자 취소(#248) 모두 보낸다.
 * 누르면 같은 조건의 매물 재등록 화면(연결 #14, #132)으로 간다. 취소를 끝낸 쪽만 부르므로 한 번만 간다
 */
export function notifyReservationCancelled(db: Db, reservationId: string) {
  const event = 'reservation.cancelled';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    await notify(db, {
      userId: alert.ownerUserId,
      accountType: 'owner',
      event,
      dedupeKey: `${event}:owner:${reservationId}`,
      title: '예약 건이 취소되었습니다',
      body: '동일한 매물을 재등록하시겠습니까?',
      url: `/owner/slots/${alert.slotId}/relist`,
    });
  });
}

/** 원장님이 노쇼로 처리했을 때 고객에게(S-405, 연결 #11). 처리는 한 번만 되므로 한 번만 간다 */
export function notifyNoShow(db: Db, reservationId: string) {
  const event = 'reservation.no_show';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    await notify(db, {
      userId: alert.customerUserId,
      accountType: 'customer',
      event,
      dedupeKey: `${event}:customer:${reservationId}`,
      title: '노쇼로 처리됐어요',
      body: '잘못 처리됐으면 문의해 주세요',
      url: `/reservations/${reservationId}`,
    });
  });
}

/** 확정하지 못한 결제를 자동 취소했을 때 고객에게(C-406, W12). 예약이 없는 주문이라 내 예약 목록으로 간다 */
export function notifyPaymentAutoCancelled(db: Db, orderId: string) {
  const event = 'payment.auto_cancelled';
  sendAfterResponse(event, async () => {
    const [row] = await db
      .select({ customerUserId: customers.userId })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, orderId));
    if (!row) return;
    await notify(db, {
      userId: row.customerUserId,
      accountType: 'customer',
      event,
      dedupeKey: `${event}:customer:${orderId}`,
      title: '결제가 취소됐어요',
      body: '결제가 취소되고 전액 환불돼요',
      url: '/reservations',
    });
  });
}

const SHOP_REVIEW_ALERTS = {
  approve: {
    event: 'shop.approved',
    title: '입점이 승인됐어요',
    body: '이제 매물을 올릴 수 있어요',
  },
  reject: {
    event: 'shop.rejected',
    title: '입점이 반려됐어요',
    body: '이유를 확인하고 다시 신청해 주세요',
  },
} as const;

/**
 * 운영자가 입점을 승인·반려했을 때 원장님에게(#50, A-101). 반려 뒤 다시 신청해서 또 심사하면 새로 보내도록
 * 심사 시각을 중복 방지 키에 넣는다
 */
export function notifyShopReviewed(
  db: Db,
  input: { shopId: string; decision: 'approve' | 'reject'; reviewedAt: Date },
) {
  const { event, title, body } = SHOP_REVIEW_ALERTS[input.decision];
  sendAfterResponse(event, async () => {
    const [row] = await db
      .select({ ownerUserId: owners.userId })
      .from(shops)
      .innerJoin(owners, eq(owners.id, shops.ownerId))
      .where(eq(shops.id, input.shopId));
    if (!row) return;
    await notify(db, {
      userId: row.ownerUserId,
      accountType: 'owner',
      event,
      dedupeKey: `${event}:owner:${input.shopId}:${input.reviewedAt.toISOString()}`,
      title,
      body,
      url: '/owner',
    });
  });
}
