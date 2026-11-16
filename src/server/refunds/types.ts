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

/** 원장님 귀책 취소 확인 창의 값(S-409, X-207, 연결 #18, #419). 금액은 화면에서 계산하지 않고 이 값을 보여준다 */
export type OwnerFaultCancelPreview = {
  reservationId: string;
  /** 예정 예약이고 서비스 시작 전(서버 시각)이면 true */
  cancellable: boolean;
  /** 손님이 실제 결제한 금액 */
  paidAmount: number;
  /** 손님에게 돌려줄 금액(= 결제액 전부) */
  refundAmount: number;
  /** 손님이 쓴 쿠폰 금액(돌려준다). 없으면 0 */
  usedCouponAmount: number;
  /** 손님에게 주는 보상 쿠폰(정책값 3,000원) */
  compensationCouponAmount: number;
  /** 원장님 패널티(정책값 5,000원). 아직 지급하지 않은 정산금에서 뗀다 */
  penaltyAmount: number;
  startAt: string;
  serverNow: string;
};
