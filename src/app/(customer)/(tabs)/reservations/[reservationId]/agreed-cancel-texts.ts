// 합의 후 취소 요청 카드 문구 (C-506, 연결 #19, #301). 문구는 동의 문구 8-2장, 50%는 정책값에서 가져온다.
// 환불액은 화면에서 계산하지 않고 getAgreedCancelRequest의 refundAmount를 그대로 쓴다.

import { formatWon } from '@/lib/format';
import { SITE_NAME } from '@/lib/site';
import { formatKst } from '@/lib/time';
import {
  AGREED_CANCEL_REASON_LABELS,
  type AgreedCancelReason,
} from '@/server/refunds/agreed-cancel-types';
import { AGREED_CANCEL_REFUND_RATE } from '@/server/policy/refund';

export const AGREED_CANCEL_TITLE = '원장님이 합의 후 취소를 요청했어요';

/** 사유. 기타면 원장님이 적은 내용을 같이 보여준다 */
export function agreedCancelReasonText(
  reason: AgreedCancelReason,
  reasonText: string | null,
): string {
  const label =
    reason === 'other' && reasonText ? `기타: ${reasonText}` : AGREED_CANCEL_REASON_LABELS[reason];
  return `사유: ${label}`;
}

/** 동의하면 돌려받는 금액. 쓴 쿠폰이 있으면 돌려주지 않는다고 같이 알린다(C-407) */
export function agreedCancelRefundText(refundAmount: number, couponAmount: number): string {
  const coupon = couponAmount > 0 ? ' 쓴 쿠폰은 돌려드리지 않아요.' : '';
  return `합의 후 취소에 동의하시면 결제액의 ${AGREED_CANCEL_REFUND_RATE}%(${formatWon(refundAmount)})만 환불받을 수 있어요.${coupon}`;
}

export const AGREED_CANCEL_GUIDE =
  '원장님께 안내를 받으셨다면 동의해 주시고, 그게 아니라면 이의제기로 알려 주세요. 동의하지 않으면 예약은 그대로예요.';

/** 답할 수 있는 마지막 시각 */
export function agreedCancelDeadlineText(expiresAt: string): string {
  return `${formatKst(new Date(expiresAt))}까지 답하지 않으면 요청이 사라져요.`;
}

/** [동의하고 취소할게요]의 확인 창(11/10 #301 Q1) */
export const AGREED_CANCEL_CONFIRM_TITLE = '합의 후 취소할까요?';
export function agreedCancelConfirmText(refundAmount: number): string {
  return `결제액의 ${AGREED_CANCEL_REFUND_RATE}%(${formatWon(refundAmount)})만 환불돼요. 취소하면 되돌릴 수 없어요.`;
}

export const AGREED_CANCEL_DECLINED = '동의하지 않았어요. 예약은 그대로예요.';
export const AGREED_CANCEL_EXPIRED = '답할 수 있는 시간이 지났어요. 예약은 그대로예요.';
export const AGREED_CANCEL_CHANNEL_LABEL = `${SITE_NAME} 카카오톡 채널로 알리기`;
