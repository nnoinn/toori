// 환불 (X-202, 연결 #9). 서버 코드용. 예: import { calcRefund } from '@/server/refunds';
// 화면('use client')에서 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 환불 미리보기·예약 취소(previewRefund, cancelReservation): '@/server/refunds/cancel'
// - 결과·실패 모양(RefundPreview, CancelledReservation, RefundError): '@/server/refunds/types', '@/server/refunds/errors'
// - 합의 후 취소(requestAgreedCancel, getAgreedCancelStatus, getAgreedCancelRequest, respondAgreedCancel): '@/server/refunds/agreed-cancel',
//   모양·사유 이름·실패 문구: '@/server/refunds/agreed-cancel-types', '@/server/refunds/agreed-cancel-errors'

export { calcRefund, getPenaltyBand, type RefundCalc } from './calc-refund';
export { REFUND_ERRORS, type RefundError, type RefundErrorCode, type RefundResult } from './errors';
export { readRefundTarget, type RefundTarget } from './refund-store';
export { sweepStaleCancels } from './sweep-cancels';
export { type AgreedCancelSweepSummary, sweepAgreedCancelRequests } from './agreed-cancel-expiry';
export type { CancelledReservation, RefundPreview } from './types';
export {
  AGREED_CANCEL_ERRORS,
  type AgreedCancelErrorCode,
  type AgreedCancelResult,
} from './agreed-cancel-errors';
export { calcAgreedCancel, isAgreedCancelTarget } from './agreed-cancel-rules';
export {
  AGREED_CANCEL_REASON_LABELS,
  AGREED_CANCEL_REASON_TEXT_MAX,
  AGREED_CANCEL_REASONS,
  AGREED_CANCEL_STATUSES,
  type AgreedCancelReason,
  type AgreedCancelRequestInfo,
  type AgreedCancelResponse,
  type AgreedCancelStatus,
  type AgreedCancelStatusView,
  type PendingAgreedCancel,
  type RequestedAgreedCancel,
} from './agreed-cancel-types';
