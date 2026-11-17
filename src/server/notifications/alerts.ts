// 이벤트별 알림 (연결 #12, #131). 서버에서만 부른다. 문구와 눌렀을 때 열 주소는 #131 표와 같다.
// 응답을 보낸 뒤 보내서 결제·취소를 늦추지 않고, 실패해도 결제·취소 결과는 그대로다.

import 'server-only';

import { eq, sql } from 'drizzle-orm';
import { after } from 'next/server';

import { formatReservationCode } from '@/components/ui/reservation-code';
import type { getDb } from '@/db';
import { customers, orders, owners, reservations, shops, slots, slotWindows } from '@/db/schema';
import { formatEndTime, formatKst } from '@/lib/time';
import { OWNER_FAULT_COUPON_AMOUNT } from '@/server/policy/owner-fault';
import { readReleasedKeptSlots } from '@/server/slot-windows/store';

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
      code: reservations.code,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
      slotId: slots.id,
      // 시간대 안 칸인데 그 시간대를 원장님이 마감했다: 마감 전에 결제를 시작한 손님이다(#308 ③-2)
      windowClosed: sql<boolean>`coalesce(${slotWindows.status} = 'closed', false)`,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .leftJoin(slotWindows, eq(slotWindows.id, slots.windowId))
    .where(eq(reservations.id, reservationId));
  return row ?? null;
}

/** 시간대를 마감할 때 결제 중이라 남긴 칸이 결제를 마쳤을 때 원장님 새 예약 알림에 더하는 말(#308 ③-2, 11/13 nnoinn) */
export const KEPT_SLOT_RESERVED_NOTE = '마감 전에 결제를 시작한 손님이에요';

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
        body: alert.windowClosed
          ? `${alert.menuName} · ${when} · ${KEPT_SLOT_RESERVED_NOTE}`
          : `${alert.menuName} · ${when}`,
        url: `/owner/reservations/${reservationId}`,
      }),
    ]);
  });
}

/**
 * 원장님이 시간대를 마감할 때 손님이 결제 중이라 남긴 칸이 결제 없이 끝나서 닫혔을 때 원장님에게(#308 ③-2, 11/13 nnoinn).
 * 닫힌 칸 id를 받아 그런 칸만 골라 보낸다(readReleasedKeptSlots). 손님이 [취소]했을 때와 결제 정리 작업이 부른다. 같은 칸은 한 번만 간다
 */
export function notifyKeptWindowSlotsReleased(db: Db, slotIds: readonly string[]) {
  if (slotIds.length === 0) return;
  const event = 'window.kept_slot_released';
  sendAfterResponse(event, async () => {
    const released = await readReleasedKeptSlots(db, slotIds);
    await Promise.all(
      released.map((slot) =>
        notify(db, {
          userId: slot.ownerUserId,
          accountType: 'owner',
          event,
          dedupeKey: `${event}:owner:${slot.slotId}`,
          title: '마감한 시간대의 남은 칸도 닫았어요',
          body: `결제가 끝나지 않아 ${formatKst(slot.startAt)}~${formatEndTime(slot.startAt, slot.endAt)}(${slot.menuName})도 닫았어요`,
          url: '/owner',
        }),
      ),
    );
  });
}

/** 누가 취소했나. customer: 앱에서 고객이 직접(포트원이 늦게 처리한 것 포함), admin: 앱을 거치지 않은 운영자 취소(#248) */
export type CancelledBy = 'customer' | 'admin';

/**
 * 예약 취소가 끝났을 때(S-400, S-408). 취소를 끝낸 쪽만 부르므로 한 번만 간다.
 * - 원장님: 서비스 시작 전이면 같은 조건의 매물 재등록 화면(연결 #14, #132)으로, 시작이 지났으면 재등록할 수 없어서
 *   "예약이 취소됐어요"만 보내고 예약 상세로 간다(재등록 화면의 START_PASSED와 같은 기준, 11/10 nnoinn #293)
 * - 고객: 운영자 취소일 때만. 같은 결제가 두 번 됐거나 앱 취소가 실패해서 운영자가 정리하면 고객이 모를 수 있다(11/10 nnoinn #293).
 *   고객이 직접 한 취소는 화면에서 결과를 봤으므로 보내지 않는다
 */
export function notifyReservationCancelled(
  db: Db,
  reservationId: string,
  { by, now }: { by: CancelledBy; now: Date },
) {
  const event = 'reservation.cancelled';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    const canRelist = alert.startAt.getTime() > now.getTime();
    const ownerAlert = canRelist
      ? {
          title: '예약 건이 취소되었습니다',
          body: '동일한 매물을 재등록하시겠습니까?',
          url: `/owner/slots/${alert.slotId}/relist`,
        }
      : {
          title: '예약이 취소됐어요',
          body: `${alert.menuName} · ${formatKst(alert.startAt)}`,
          url: `/owner/reservations/${reservationId}`,
        };
    await Promise.all([
      notify(db, {
        userId: alert.ownerUserId,
        accountType: 'owner',
        event,
        dedupeKey: `${event}:owner:${reservationId}`,
        ...ownerAlert,
      }),
      by === 'admin'
        ? notify(db, {
            userId: alert.customerUserId,
            accountType: 'customer',
            event,
            dedupeKey: `${event}:customer:${reservationId}`,
            title: '예약이 취소됐어요',
            body: '환불 내용은 예약 상세에서 확인해 주세요',
            url: `/reservations/${reservationId}`,
          })
        : null,
    ]);
  });
}

/**
 * 원장님 귀책 취소가 끝났을 때 손님에게(X-207, S-409, #419, 11/15 nnoinn 문구). 결제한 금액 전부와 보상 쿠폰, 쓴 쿠폰을 돌려줬으면 그것도 알린다.
 * 원장님 사정이라 원장님에게 재등록 안내(S-400)는 보내지 않는다. 취소를 끝낸 쪽만 부르므로 한 번만 간다
 */
export function notifyOwnerFaultCancelled(
  db: Db,
  reservationId: string,
  { couponReturned }: { couponReturned: boolean },
) {
  const event = 'reservation.owner_fault_cancelled';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    const coupon = `${OWNER_FAULT_COUPON_AMOUNT.toLocaleString('ko-KR')}원 쿠폰`;
    await notify(db, {
      userId: alert.customerUserId,
      accountType: 'customer',
      event,
      dedupeKey: `${event}:customer:${reservationId}`,
      title: '원장님 사정으로 예약이 취소됐어요',
      body: couponReturned
        ? `결제한 금액을 모두 돌려드리고 ${coupon}을 드렸어요. 사용하신 쿠폰도 돌려드렸어요`
        : `결제한 금액을 모두 돌려드리고 ${coupon}을 드렸어요`,
      url: `/reservations/${reservationId}`,
    });
  });
}

/** 예약 무효 손님 알림의 본문(A-108, #423 승인 문구, 11/17 nnoinn "사용하신"). 돌려준 돈이 없으면(이미 다 돌려줬거나 쿠폰으로 0원 결제) 금액은 말하지 않는다 */
export function voidedCustomerBody(refundAmount: number, couponReturned: boolean): string {
  if (refundAmount > 0) {
    const refunded = `${refundAmount.toLocaleString('ko-KR')}원을 돌려드렸어요`;
    return couponReturned ? `${refunded}. 사용하신 쿠폰도 돌려드렸어요` : refunded;
  }
  return couponReturned
    ? '사용하신 쿠폰을 돌려드렸어요'
    : '자세한 내용은 예약 상세에서 확인해 주세요';
}

/**
 * 운영자가 예약을 무효로 처리했을 때 손님과 원장님에게(A-108, #423, 11/15 nnoinn 문구). 무효는 원장님 요청으로만 하므로 원장님에게는
 * 요청을 처리했다고 알리고, 재등록 안내(S-400)는 보내지 않는다. 무효를 끝낸 쪽만 부르므로 한 번만 간다
 */
export function notifyReservationVoided(
  db: Db,
  reservationId: string,
  { refundAmount, couponReturned }: { refundAmount: number; couponReturned: boolean },
) {
  const event = 'reservation.voided';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    await Promise.all([
      notify(db, {
        userId: alert.customerUserId,
        accountType: 'customer',
        event,
        dedupeKey: `${event}:customer:${reservationId}`,
        title: '예약이 무효 처리됐어요',
        body: voidedCustomerBody(refundAmount, couponReturned),
        url: `/reservations/${reservationId}`,
      }),
      notify(db, {
        userId: alert.ownerUserId,
        accountType: 'owner',
        event,
        dedupeKey: `${event}:owner:${reservationId}`,
        title: '요청하신 예약 무효를 처리했어요',
        body: `예약번호 ${formatReservationCode(alert.code)} · 정산에서 빠져요`,
        url: `/owner/reservations/${reservationId}`,
      }),
    ]);
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

/**
 * 운영자가 원장님 대신 방문·노쇼로 처리했을 때 원장님에게(#373 ③, 11/16). 원장님 예약을 운영자가 바꿨다는 것을 알린다.
 * 손님에게 가는 노쇼 알림은 원장님이 처리했을 때와 같이 notifyNoShow가 보낸다(방문은 손님 알림 없음)
 */
export function notifyVisitRecordedByAdmin(
  db: Db,
  reservationId: string,
  result: 'visited' | 'no_show',
) {
  const event = 'reservation.visit_recorded_by_admin';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    await notify(db, {
      userId: alert.ownerUserId,
      accountType: 'owner',
      event,
      dedupeKey: `${event}:owner:${reservationId}`,
      title:
        result === 'no_show'
          ? '운영자가 예약을 노쇼로 처리했어요'
          : '운영자가 예약을 방문으로 처리했어요',
      body: `${alert.menuName} · ${formatKst(alert.startAt)}`,
      url: `/owner/reservations/${reservationId}`,
    });
  });
}

/**
 * 운영자가 잘못 누른 노쇼를 방문으로 되돌렸을 때 손님과 원장님에게(#373 ③, 11/16). 손님은 노쇼 알림을 이미 받았으니 바로잡힌 것도 알린다.
 * 이의제기 결론의 "노쇼 취소"는 이 알림을 보내지 않는다(11/12 결정, 결론 알림 없음)
 */
export function notifyNoShowReversed(db: Db, reservationId: string) {
  const event = 'reservation.no_show_reversed';
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
        title: '노쇼 처리가 취소됐어요',
        body: `${alert.shopName} · ${when} 예약이 방문으로 바뀌었어요`,
        url: `/reservations/${reservationId}`,
      }),
      notify(db, {
        userId: alert.ownerUserId,
        accountType: 'owner',
        event,
        dedupeKey: `${event}:owner:${reservationId}`,
        title: '운영자가 노쇼를 방문으로 바꿨어요',
        body: `${alert.menuName} · ${when}`,
        url: `/owner/reservations/${reservationId}`,
      }),
    ]);
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

/** 운영자 매물 관리 알림에 붙이는 문의 안내. 운영자가 적은 사유는 원장님에게 보이지 않는다(#373 ④, 11/16 강규민 결정) */
const ADMIN_CONTACT_NOTE = '궁금하면 투리 카카오톡 채널로 문의해 주세요';

/** 샵 원장님의 로그인 id. 없는 샵이면 null */
async function readShopOwnerUserId(db: Db, shopId: string): Promise<string | null> {
  const [row] = await db
    .select({ ownerUserId: owners.userId })
    .from(shops)
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .where(eq(shops.id, shopId));
  return row?.ownerUserId ?? null;
}

/**
 * 운영자가 샵의 새 매물 게시를 멈추거나 다시 열었을 때 원장님에게(#373 ④). 멈출 때마다 새로 가도록 바꾼 시각을 중복 방지 키에 넣는다
 */
export function notifyPublishPauseChanged(
  db: Db,
  input: { shopId: string; paused: boolean; changedAt: Date },
) {
  const event = input.paused ? 'shop.publish_paused' : 'shop.publish_resumed';
  sendAfterResponse(event, async () => {
    const ownerUserId = await readShopOwnerUserId(db, input.shopId);
    if (!ownerUserId) return;
    await notify(db, {
      userId: ownerUserId,
      accountType: 'owner',
      event,
      dedupeKey: `${event}:owner:${input.shopId}:${input.changedAt.toISOString()}`,
      title: input.paused ? '새 매물 등록이 잠시 멈췄어요' : '새 매물을 다시 올릴 수 있어요',
      body: input.paused
        ? `운영자 확인 중이에요. 이미 올린 매물과 예약은 그대로예요. ${ADMIN_CONTACT_NOTE}`
        : '운영자 확인이 끝났어요',
      url: '/owner',
    });
  });
}

/** 운영자가 매물을 강제 마감했을 때 원장님에게(#373 ④). 매물 하나에 한 번 */
export function notifySlotForceClosed(db: Db, slotId: string) {
  const event = 'slot.force_closed';
  sendAfterResponse(event, async () => {
    const [row] = await db
      .select({ shopId: slots.shopId, menuName: slots.menuName, startAt: slots.startAt })
      .from(slots)
      .where(eq(slots.id, slotId));
    if (!row) return;
    const ownerUserId = await readShopOwnerUserId(db, row.shopId);
    if (!ownerUserId) return;
    await notify(db, {
      userId: ownerUserId,
      accountType: 'owner',
      event,
      dedupeKey: `${event}:owner:${slotId}`,
      title: '운영자가 매물을 마감했어요',
      body: `${row.menuName} · ${formatKst(row.startAt)}. ${ADMIN_CONTACT_NOTE}`,
      url: '/owner',
    });
  });
}

/** 운영자가 시간대 매물을 강제 마감했을 때 원장님에게(#373 ④). 결제가 끝난 예약은 그대로라고 알린다. 시간대 하나에 한 번 */
export function notifyWindowForceClosed(db: Db, windowId: string) {
  const event = 'window.force_closed';
  sendAfterResponse(event, async () => {
    const [row] = await db
      .select({
        shopId: slotWindows.shopId,
        startAt: slotWindows.startAt,
        endAt: slotWindows.endAt,
      })
      .from(slotWindows)
      .where(eq(slotWindows.id, windowId));
    if (!row) return;
    const ownerUserId = await readShopOwnerUserId(db, row.shopId);
    if (!ownerUserId) return;
    await notify(db, {
      userId: ownerUserId,
      accountType: 'owner',
      event,
      dedupeKey: `${event}:owner:${windowId}`,
      title: '운영자가 시간대 매물을 마감했어요',
      body: `${formatKst(row.startAt)}~${formatEndTime(row.startAt, row.endAt)}. 결제가 끝난 예약은 그대로예요. ${ADMIN_CONTACT_NOTE}`,
      url: '/owner',
    });
  });
}

/**
 * 정산 계좌가 바뀌었을 때 원장님에게(#295, 11/1 결정). 직접 바꾸지 않았으면 바로 알아채게 한다.
 * 은행·뒷자리는 잠금 화면에 보일 수 있어서 넣지 않는다. 바꿀 때마다 보내도록 변경 기록 id를 중복 방지 키에 넣는다
 */
export function notifyPayoutAccountChanged(db: Db, input: { shopId: string; changeId: string }) {
  const event = 'payout_account.changed';
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
      dedupeKey: `${event}:owner:${input.changeId}`,
      title: '정산 계좌가 바뀌었어요',
      body: '직접 바꾸지 않았다면 바로 문의해 주세요',
      url: '/owner/settings/payout',
    });
  });
}

/**
 * 원장님이 합의 후 취소를 요청했을 때 고객에게(S-410 → C-506, #301). 누르면 내 예약 상세의 요청 카드로 간다.
 * 다시 요청하면 새로 가도록 요청 id를 중복 방지 키에 넣는다
 */
export function notifyAgreedCancelRequested(
  db: Db,
  input: { reservationId: string; requestId: string },
) {
  const event = 'reservation.agreed_cancel_requested';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, input.reservationId);
    if (!alert) return;
    await notify(db, {
      userId: alert.customerUserId,
      accountType: 'customer',
      event,
      dedupeKey: `${event}:customer:${input.requestId}`,
      title: '원장님이 합의 후 취소를 요청했어요',
      body: `${alert.shopName} · ${formatKst(alert.startAt)}`,
      url: `/reservations/${input.reservationId}`,
    });
  });
}

/** 합의 후 취소 결과(원장님 알림) */
export type AgreedCancelResultKind = 'agreed' | 'declined' | 'expired';

const AGREED_CANCEL_RESULT_TITLES: Record<AgreedCancelResultKind, string> = {
  agreed: '손님이 합의 후 취소에 동의했어요',
  declined: '손님이 합의 후 취소에 동의하지 않았어요',
  expired: '합의 후 취소 요청이 만료됐어요',
};

/**
 * 합의 후 취소 결과를 원장님에게(#301): 손님이 동의·거절했거나 24시간 안에 답하지 않았을 때. 누르면 원장님 예약 상세로 간다.
 * 동의해도 재등록 안내는 보내지 않는다(서비스 시간 무렵의 취소라서). 요청마다 한 번만 간다.
 * 예약 작업(만료)처럼 응답 뒤가 아닌 곳에서는 이 함수를 기다려서 부른다
 */
export async function sendAgreedCancelResult(
  db: Db,
  input: { reservationId: string; requestId: string; result: AgreedCancelResultKind },
): Promise<void> {
  const event = `reservation.agreed_cancel_${input.result}`;
  const alert = await readReservationAlert(db, input.reservationId);
  if (!alert) return;
  await notify(db, {
    userId: alert.ownerUserId,
    accountType: 'owner',
    event,
    dedupeKey: `${event}:owner:${input.requestId}`,
    title: AGREED_CANCEL_RESULT_TITLES[input.result],
    body: `${alert.menuName} · ${formatKst(alert.startAt)}`,
    url: `/owner/reservations/${input.reservationId}`,
  });
}

/** 손님이 답했을 때(서버 함수 안) 응답을 보낸 뒤 원장님에게 결과 알림을 보낸다 */
export function notifyAgreedCancelResult(
  db: Db,
  input: { reservationId: string; requestId: string; result: AgreedCancelResultKind },
) {
  sendAfterResponse(`reservation.agreed_cancel_${input.result}`, () =>
    sendAgreedCancelResult(db, input),
  );
}
