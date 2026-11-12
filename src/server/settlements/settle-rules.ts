// 거래 하나의 정산 종류와 지급 일정 (X-205, X-206, A-104, 11/9 결정, #353). 계산만 한다.
// 원장님 정산 내역(S-501, #129)과 목요일 묶기 작업(W20 ③)이 같이 쓴다.
//
// - 종류: 이용 완료 sale, 노쇼 no_show, 고객 취소 penalty, 합의 후 취소 agreed_cancel
// - 정산 줄이 없는 거래(기준 금액 0): 원장님 귀책 취소, 운영자 취소(admin_exception 환불이 있는 예약), 자동 취소
// - 묶는 때: 이의제기 접수 기한이 지났고 확인 중(open) 이의제기가 없으면, 기한이 지난 뒤 첫 지급일(payout-date.ts)
// - 이의제기 중이면 보류이고, 결론이 나면 돌아오는 지급일에 들어간다

import type { SettlementItemKind } from '@/db/schema/settlements';
import type { CancelActor } from '@/db/schema/payments';
import { disputeDeadline, type DisputeTarget } from '@/server/disputes/rules';

import { payoutDateFor } from './payout-date';

/** 정산 규칙에 필요한 예약 값 */
export type SettleTarget = DisputeTarget & {
  cancelActor: CancelActor | null;
  /** 끝난(done) 고객 취소·합의 후 취소 환불 기록의 위약금 비율(그때 값). 없으면 null */
  cancelPenaltyRate: number | null;
  /** 운영자 취소 환불(admin_exception)이 있는 예약. 원장님 기준 금액이 0이다(기술 가이드 7장 "앱을 거치지 않은 취소") */
  hasAdminRefund: boolean;
};

/** 정산 줄의 종류. 고객 취소·합의 후 취소는 기준 금액을 정할 위약금 비율을 같이 준다 */
export type SettleKind =
  | { kind: Extract<SettlementItemKind, 'sale' | 'no_show'> }
  | { kind: Extract<SettlementItemKind, 'penalty' | 'agreed_cancel'>; penaltyRate: number };

/**
 * 정산 줄을 만들 거래면 종류, 아니면 null.
 * 예정 예약, 끝난 환불 기록이 없는 취소(환불 진행 중), 기준 금액이 0인 취소는 null이다
 */
export function settlementKindOf(target: SettleTarget): SettleKind | null {
  if (target.hasAdminRefund) return null;
  if (target.status === 'completed') {
    if (target.visitResult === 'visited') return { kind: 'sale' };
    if (target.visitResult === 'no_show') return { kind: 'no_show' };
    return null;
  }
  if (target.status !== 'cancelled' || target.cancelPenaltyRate === null) return null;
  if (target.cancelActor === 'customer') {
    return { kind: 'penalty', penaltyRate: target.cancelPenaltyRate };
  }
  if (target.cancelActor === 'agreed') {
    return { kind: 'agreed_cancel', penaltyRate: target.cancelPenaltyRate };
  }
  return null;
}

/** 끝난 예약의 이의제기 접수 기한. 예정 예약이면 에러(정산할 거래가 아니다) */
function settleReadyAt(target: DisputeTarget): Date {
  const deadline = disputeDeadline(target);
  if (!deadline) throw new RangeError('끝나지 않은 예약은 정산 일정이 없어요');
  return deadline;
}

/** 아직 묶지 않은 거래의 지급 일정: 이의제기 중 보류(held) 또는 지급 예정일(scheduled) */
export type SettleSchedule = { status: 'held' } | { status: 'scheduled'; payoutDate: string };

/**
 * 아직 묶지 않은 거래의 지급 일정. 이의제기 접수 기한과 지금 중 늦은 때가 지난 첫 지급일이다.
 * 기한이 지났는데 아직 묶이지 않았으면(이의제기 결론이 늦게 났거나 그날 묶기가 끝난 뒤) 돌아오는 지급일이다
 */
export function settlementSchedule(
  target: DisputeTarget,
  input: { hasOpenDispute: boolean; now: Date },
): SettleSchedule {
  const readyAt = settleReadyAt(target);
  if (input.hasOpenDispute) return { status: 'held' };
  const from = readyAt.getTime() > input.now.getTime() ? readyAt : input.now;
  return { status: 'scheduled', payoutDate: payoutDateFor(from) };
}

/**
 * 지급일 묶기(cutoff = 지급일 0시)에 들어갈 거래인지: 확인 중 이의제기가 없고, 이의제기 접수 기한이 cutoff까지 지났다.
 * 기한이 cutoff와 같아도 들어간다(기한 시각부터는 접수할 수 없다)
 */
export function isReadyToSettle(
  target: DisputeTarget,
  input: { hasOpenDispute: boolean; cutoff: Date },
): boolean {
  if (input.hasOpenDispute) return false;
  return settleReadyAt(target).getTime() <= input.cutoff.getTime();
}
