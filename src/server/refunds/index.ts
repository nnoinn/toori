// 환불 (X-202, 연결 #9). 서버 코드용. 예: import { calcRefund } from '@/server/refunds';
// 화면('use client')에서 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 환불 미리보기·예약 취소(previewRefund, cancelReservation): '@/server/refunds/cancel'
// - 결과·실패 모양(RefundPreview, CancelledReservation, RefundError): '@/server/refunds/types', '@/server/refunds/errors'

export { calcRefund, getPenaltyBand, type RefundCalc } from './calc-refund';
export { REFUND_ERRORS, type RefundError, type RefundErrorCode, type RefundResult } from './errors';
export { readRefundTarget, type RefundTarget } from './refund-store';
export type { CancelledReservation, RefundPreview } from './types';
