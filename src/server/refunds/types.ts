// 환불 미리보기·예약 취소가 돌려주는 값 (연결 #9, #128). 시각은 ISO 문자열이다. 화면과 서버 어디서나 가져올 수 있다.

import type { RefundBand } from '@/db/schema/refunds';

/** previewRefund 결과. 취소 화면(C-503)은 금액을 계산하지 않고 이 값을 그대로 보여준다 */
export type RefundPreview = {
  reservationId: string;
  /** false면 취소 버튼 대신 안내(시작까지 6시간 미만·시작 뒤, 10/29 결정) */
  refundable: boolean;
  band: RefundBand;
  /** 위약금 비율(%) */
  penaltyRate: number;
  /** 실제 결제액(쿠폰을 뺀 금액) */
  paidAmount: number;
  /** 돌려줄 금액(실제 결제액 기준) */
  refundAmount: number;
  /** 위약금 */
  penaltyAmount: number;
  /** 쓴 쿠폰. 0보다 크면 "쿠폰은 돌려드리지 않아요" 안내(C-407) */
  couponAmount: number;
  startAt: string;
  serverNow: string;
};

/** cancelReservation 결과 */
export type CancelledReservation = {
  reservationId: string;
  refundAmount: number;
  cancelledAt: string;
};
