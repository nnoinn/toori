// 예약 상세의 환불 내역(#528 제안 4번, 11/21 정찬형). 화면과 테스트가 같이 쓴다.
// 환불은 예약 하나에 보통 한 번이지만, 고객 취소로 일부 돌려받은 뒤 무효가 되면 나머지를 한 번 더 돌려받는다(VOID-02).
// 한 번이면 지금처럼 이름 없이, 두 번 이상이면 줄마다 이름을 붙이고 돌려받은 금액 합계를 둔다. 무효 환불에는 위약금이 없어서 위약금 줄을 뺀다

import type { RefundReason } from '@/db/schema/refunds';

export type MyRefund = {
  reason: RefundReason;
  refundAmount: number;
  penaltyAmount: number;
  penaltyRate: number;
  /** ISO */
  processedAt: string;
};

export type RefundHistoryRow = {
  /** 환불이 두 번 이상일 때만 붙는 이름(예약 취소, 예약 무효 등) */
  label: string | null;
  refundAmount: number;
  /** 무효 환불이면 null(위약금 줄을 그리지 않는다) */
  penalty: { amount: number; rate: number } | null;
  processedAt: string;
};

/** 손님이 보는 환불 이름. 자동 취소(예약 전 결제 취소)는 예약 상세에 오지 않지만 이름은 둔다 */
const REFUND_LABEL: Record<RefundReason, string> = {
  customer_cancel: '예약 취소',
  owner_fault: '원장님 사정 취소',
  agreed_cancel: '합의 후 취소',
  admin_exception: '운영자 처리',
  auto_cancel: '자동 취소',
  void: '예약 무효',
};

/** 끝난 환불들 → 환불 내역 칸. 없으면 null(칸을 그리지 않는다) */
export function refundHistory(
  refunds: MyRefund[],
): { rows: RefundHistoryRow[]; total: number | null } | null {
  if (refunds.length === 0) return null;
  const several = refunds.length > 1;
  const rows = [...refunds]
    .sort((a, b) => a.processedAt.localeCompare(b.processedAt))
    .map((refund) => ({
      label: several ? REFUND_LABEL[refund.reason] : null,
      refundAmount: refund.refundAmount,
      penalty:
        refund.reason === 'void'
          ? null
          : { amount: refund.penaltyAmount, rate: refund.penaltyRate },
      processedAt: refund.processedAt,
    }));
  return {
    rows,
    total: several ? rows.reduce((sum, row) => sum + row.refundAmount, 0) : null,
  };
}
