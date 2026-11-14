// 계정 이력(#374) 화면 문구. 원장님 계정 이력(정민석)과 운영자 [이력 보기]가 같이 써서, 문구는 여기 한 곳에서만 고친다.
// 화면과 서버 어디서나 가져올 수 있다. 시각 자체(줄 앞 "2026-11-12 21:50")는 화면이 formatKstDateTime으로 쓴다.

import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { bankName } from '@/server/policy/banks';
import {
  AGREED_CANCEL_REASON_LABELS,
  type AgreedCancelReason,
} from '@/server/refunds/agreed-cancel-types';

import type { AccountHistoryEvent, AccountType } from './history-types';

/** 누가 보는 화면인지(원장님 내 계정 / 운영자). 누르면 열 화면 주소가 다르다 */
export type HistoryAudience = 'owner' | 'admin';

export type HistoryText = {
  title: string;
  /** 예약번호·서비스·금액 같은 짧은 설명. 없으면 null */
  detail: string | null;
  /** 누르면 열 화면. 없으면 null */
  href: string | null;
};

/** 매물·시간대 마감 사유(원장님 화면 SLOT_CLOSE_REASON_LABELS와 같은 이름) */
const CLOSE_REASONS: Record<string, string> = {
  other_channel: '다른 곳 예약',
  mistake: '잘못 올림',
  other: '기타',
  hold_released: '결제 없이 홀딩 끝남',
};

/** 누가 예약을 취소했는지 */
const CANCEL_TITLES: Record<string, string> = {
  customer: '고객 취소',
  owner_fault: '원장님 사정 취소',
  agreed: '합의 후 취소',
  admin: '운영자 취소',
  system: '자동 취소',
};

const REFUND_REASONS: Record<string, string> = {
  customer_cancel: '고객 취소',
  owner_fault: '원장님 사정 취소',
  agreed_cancel: '합의 후 취소',
  auto_cancel: '자동 취소',
  admin_exception: '운영자 환불',
};

const AGREED_RESULTS: Record<string, string> = {
  agreed: '손님 동의',
  declined: '손님 거절',
  expired: '24시간 안에 답이 없어 끝남',
  closed: '답하기 전에 끝남',
};

const DISPUTE_TYPES: Record<string, string> = {
  no_show: '노쇼 처리 오류',
  after_start: '서비스 중 문제',
  refund_exception: '환불·취소 금액',
};

const DISPUTE_OUTCOMES: Record<string, string> = {
  no_show_confirmed: '노쇼 확정',
  no_show_reversed: '노쇼 취소(방문으로 바꿈)',
  refund_exception: '환불 예외',
  voided: '무효',
  owner_fault_cancel: '원장님 사정 취소로 바꿈',
  no_change: '바꾸지 않음',
};

const CONSENTS: Record<string, string> = {
  marketing: '광고성 정보 수신',
  interest_alert: '관심 동네·찜한 샵 새 매물 알림',
};

const COUPON_REASONS: Record<string, string> = {
  owner_fault_compensation: '원장님 사정 취소 보상',
};

const label = (labels: Record<string, string>, value: string | null) =>
  value ? (labels[value] ?? value) : null;

/** 빈 값을 빼고 " · "로 잇는다. 하나도 없으면 null */
function join(parts: readonly (string | null | false)[]): string | null {
  const kept = parts.filter((part): part is string => Boolean(part));
  return kept.length > 0 ? kept.join(' · ') : null;
}

function reservationPart(event: AccountHistoryEvent): (string | null)[] {
  return [
    event.reservationCode ? `예약 ${event.reservationCode}` : null,
    event.menuName,
    event.startAt ? formatKst(new Date(event.startAt)) : null,
  ];
}

function slotPart(event: AccountHistoryEvent): (string | null)[] {
  return [event.menuName, event.startAt ? formatKst(new Date(event.startAt)) : null];
}

/**
 * 이력 한 줄의 문구. accountType은 누구의 이력인지(운영자는 원장님·고객을 다 본다). 금액 이름이 다르다:
 * 원장님 이력은 판매가, 고객 이력은 결제액
 */
export function historyText(
  event: AccountHistoryEvent,
  options: { audience: HistoryAudience; accountType?: AccountType },
): HistoryText {
  const accountType = options.accountType ?? 'owner';
  const href = event.reservationId
    ? options.audience === 'owner'
      ? `/owner/reservations/${event.reservationId}`
      : `/admin/reservations/${event.reservationId}`
    : null;
  const won = event.amount === null ? null : formatWon(event.amount);
  const text = (title: string, detail: string | null): HistoryText => ({ title, detail, href });

  switch (event.kind) {
    case 'shop_applied':
      return text('입점 신청', null);
    case 'shop_approved':
      return text('입점 승인', null);
    case 'shop_rejected':
      return text('입점 반려', event.reason);
    case 'slot_created':
      return text('매물 등록', join([...slotPart(event), won && `판매가 ${won}`]));
    case 'slot_relisted':
      return text('매물 재등록', join([...slotPart(event), won && `판매가 ${won}`]));
    case 'slot_published':
      return text('매물 게시', join(slotPart(event)));
    case 'slot_closed':
      return text('매물 마감', join([...slotPart(event), label(CLOSE_REASONS, event.reason)]));
    case 'window_created':
      return text('시간대 등록', join([event.startAt && formatKst(new Date(event.startAt))]));
    case 'window_closed':
      return text(
        '시간대 마감',
        join([
          event.startAt && formatKst(new Date(event.startAt)),
          label(CLOSE_REASONS, event.reason),
        ]),
      );
    case 'reservation_created':
      return accountType === 'owner'
        ? text('새 예약', join([...reservationPart(event), won && `판매가 ${won}`]))
        : text('예약', join([...reservationPart(event), won && `결제 ${won}`]));
    case 'reservation_cancelled':
      return text(
        label(CANCEL_TITLES, event.reason) ?? '예약 취소',
        join([
          ...reservationPart(event),
          event.hoursBeforeStart !== null && `시작 ${event.hoursBeforeStart}시간 전`,
          event.rate !== null && `위약금 ${event.rate}%`,
        ]),
      );
    case 'agreed_cancel_requested':
      return text(
        accountType === 'owner' ? '합의 후 취소 요청' : '합의 후 취소 요청 받음',
        join([
          ...reservationPart(event),
          event.reason
            ? (AGREED_CANCEL_REASON_LABELS[event.reason as AgreedCancelReason] ?? event.reason)
            : null,
        ]),
      );
    case 'agreed_cancel_resolved':
      return text(
        '합의 후 취소 결과',
        join([
          event.reservationCode && `예약 ${event.reservationCode}`,
          label(AGREED_RESULTS, event.result),
        ]),
      );
    case 'visit_recorded':
      return text(
        event.result === 'no_show' ? '노쇼 처리' : '방문 처리',
        join(reservationPart(event)),
      );
    case 'payout_account_changed':
      return text('정산 계좌 변경', event.reason ? bankName(event.reason) : null);
    case 'settlement_paid':
      return text('정산 지급', won);
    case 'signed_up':
      return text('가입', null);
    case 'refund_done':
      return text(
        '환불',
        join([
          event.reservationCode && `예약 ${event.reservationCode}`,
          label(REFUND_REASONS, event.reason),
          won,
        ]),
      );
    case 'coupon_issued':
      return text('쿠폰 받음', join([won, label(COUPON_REASONS, event.reason)]));
    case 'coupon_used':
      return text('쿠폰 사용', won);
    case 'dispute_filed':
      return text(
        '이의제기 접수',
        join([
          event.reservationCode && `예약 ${event.reservationCode}`,
          label(DISPUTE_TYPES, event.reason),
        ]),
      );
    case 'dispute_resolved':
      return text(
        '이의제기 결론',
        join([
          event.reservationCode && `예약 ${event.reservationCode}`,
          label(DISPUTE_OUTCOMES, event.result),
        ]),
      );
    case 'consent_agreed':
      return text('알림 동의', label(CONSENTS, event.reason));
    case 'consent_withdrawn':
      return text('알림 동의 철회', label(CONSENTS, event.reason));
  }
}
