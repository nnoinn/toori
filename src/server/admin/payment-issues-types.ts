// 운영자 결제·환불 확인(#373 ①) 서버 함수의 입력·출력. 화면과 서버 어디서나 가져올 수 있다.

import type { SweepResult } from '@/server/payments/sweep-orders';
import type { SettleResult } from '@/server/refunds/finish-cancel';

/**
 * 주문 [다시 시도] 결과(결제 정리 작업과 같다). confirmed: 예약 확정, autoCancelled: 결제 취소(자동 취소),
 * failed: 결제가 안 된 것으로 확인, abandoned: 결제창에서 결제하지 않음, left: 이번에도 정하지 못함
 */
export type OrderRetryResult = SweepResult;

/** 환불 [다시 시도] 결과(취소 정리 작업과 같다). finished: 환불 끝, cleared: 환불이 없어 진행 표시를 지움, left: 아직 처리 중 */
export type CancelRetryResult = SettleResult;

export type RetryStuckOrderInput = { orderId: string; reason: string };
export type RetryStuckCancelInput = { reservationId: string; reason: string };
export type CheckRefundReviewInput = { refundId: string; reason: string };

export type RetriedOrder = { orderId: string; result: OrderRetryResult };
export type RetriedCancel = { reservationId: string; result: CancelRetryResult };
export type CheckedRefund = { refundId: string };
