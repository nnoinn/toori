// 예약 취소 확인 창 문구 (J13, C-503). 금액은 서버 미리보기(previewRefund) 그대로 쓰고, 여기서는 문구만 만든다.
// 화면과 서버 어디서나 쓴다. 숫자는 정책값(REFUND_BANDS 등)에서만 온다.

import { formatWon } from '@/lib/format';
import { NO_SHOW_PENALTY_RATE, REFUND_BANDS } from '@/server/policy';

import { refundPolicyLines } from '../../slots/[slotId]/detail-format';

/**
 * 이 취소에 적용되는 환불 규정 한 줄(매물 상세·결제 동의와 같은 문구). 구간마다 위약금 비율이 달라서 비율로 찾는다.
 * 예: 30 → "24시간 이상 남음: 70% 환불(위약금 30%)". 맞는 구간이 없으면 null
 */
export function appliedRefundRule(penaltyRate: number): string | null {
  const index = REFUND_BANDS.findIndex((band) => band.penaltyRate === penaltyRate);
  return index === -1 ? null : refundPolicyLines(REFUND_BANDS, NO_SHOW_PENALTY_RATE)[index];
}

/** 쿠폰을 쓴 예약을 취소할 때 꼭 보여주는 안내(C-407, 동의 문구 3장과 같은 문구) */
export const COUPON_NOT_RETURNED_NOTE =
  '쿠폰을 쓴 예약을 취소하면 쿠폰은 돌려드리지 않고, 환불은 실제 결제한 금액 기준이에요.';

/** 취소한 뒤 안내. 돌려줄 금액이 0원이면(쿠폰으로 전액 결제 등) 환불 문구 대신 그 사실을 알린다 */
export function cancelDoneText(refundAmount: number): string {
  return refundAmount > 0
    ? `${formatWon(refundAmount)}을 환불해 드려요.`
    : '돌려드릴 결제 금액은 없어요.';
}
