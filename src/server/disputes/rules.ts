// 이의제기 접수 규칙 (C-507, A-104, 11/9·11/10 결정, #299). 계산만 한다. 화면은 이 계산 대신 getDisputeStatus 결과를 쓴다.
// 접수 기한 계산은 운영자 등록(A-104, W19 ②)과 정산 묶기(W20)도 이 함수를 쓴다.
//
// - 받기 시작: 예정·이용 완료 예약은 서비스 시작, 취소된 예약은 취소된 때(Q1)
// - 기한: 시작·방문·노쇼 처리·취소 중 가장 늦은 때부터 영업일 기준 48시간(토·일·공휴일 제외).
//   시작이 지났는데 원장님이 아직 방문·노쇼 처리를 안 했으면 처리 시각부터 세므로 아직 정해지지 않는다(null)
// - 종류: no_show는 노쇼 예약만, after_start는 시작 뒤·취소 아닌 예약만(노쇼면 서비스를 받지 않아서 뺀다), refund_exception은 모두(Q2)
// - 한 예약에 한 번(Q3)
// - 내용: 빈칸(공백만 있는 것 포함)만 막고, 안전 상한 5,000자(11/13 nnoinn, #360 2번)

import { DISPUTE_TYPES, type DisputeType } from '@/db/schema/admin';
import type { ReservationStatus, VisitResult } from '@/db/schema/payments';
import { DISPUTE_CONTENT_LIMIT, DISPUTE_DEADLINE_BUSINESS_HOURS } from '@/server/policy/dispute';
import { addBusinessHours } from '@/server/policy/holidays';

import type { DisputeState } from './types';

/** 규칙에 필요한 예약 값 */
export type DisputeTarget = {
  status: ReservationStatus;
  startAt: Date;
  visitResult: VisitResult | null;
  visitRecordedAt: Date | null;
  cancelledAt: Date | null;
};

/** 접수를 받기 시작하는 때 */
export function disputeOpensAt(target: DisputeTarget): Date {
  return target.status === 'cancelled' && target.cancelledAt ? target.cancelledAt : target.startAt;
}

/** 접수 기한. 예정 예약(방문·노쇼 처리 전)은 아직 정해지지 않아서 null */
export function disputeDeadline(target: DisputeTarget): Date | null {
  if (target.status === 'confirmed') return null;
  const base = Math.max(
    target.startAt.getTime(),
    target.visitRecordedAt?.getTime() ?? 0,
    target.cancelledAt?.getTime() ?? 0,
  );
  return addBusinessHours(new Date(base), DISPUTE_DEADLINE_BUSINESS_HOURS);
}

/** 이 예약에서 고를 수 있는 종류(DISPUTE_TYPES 순서) */
export function disputeTypes(target: DisputeTarget): DisputeType[] {
  const noShow = target.visitResult === 'no_show';
  return DISPUTE_TYPES.filter((type) => {
    if (type === 'no_show') return noShow;
    if (type === 'after_start') return target.status !== 'cancelled' && !noShow;
    return true;
  });
}

/** 지금 접수할 수 없는 이유. 접수할 수 있으면 null */
export function disputeBlockReason(
  target: DisputeTarget,
  hasDispute: boolean,
  now: Date,
): 'ALREADY_SUBMITTED' | 'NOT_OPEN_YET' | 'DEADLINE_PASSED' | null {
  if (hasDispute) return 'ALREADY_SUBMITTED';
  if (now.getTime() < disputeOpensAt(target).getTime()) return 'NOT_OPEN_YET';
  const deadline = disputeDeadline(target);
  if (deadline && now.getTime() >= deadline.getTime()) return 'DEADLINE_PASSED';
  return null;
}

/** 화면이 고를 칸 */
export function disputeState(target: DisputeTarget, hasDispute: boolean, now: Date): DisputeState {
  const reason = disputeBlockReason(target, hasDispute, now);
  if (reason === 'ALREADY_SUBMITTED') return 'submitted';
  if (reason === 'NOT_OPEN_YET') return 'not_open';
  if (reason === 'DEADLINE_PASSED') return 'closed';
  return 'open';
}

/**
 * 내용 확인(11/13 nnoinn). 앞뒤 공백을 뺀 길이로 센다. 빈칸이면 DISPUTE_CONTENT_REQUIRED,
 * 안전 상한(DISPUTE_CONTENT_LIMIT)을 넘으면 DISPUTE_CONTENT_TOO_LONG, 괜찮으면 null.
 * 고객 접수와 운영자 등록이 같이 쓰고, 화면도 같은 기준을 쓰도록 가져다 쓸 수 있다
 */
export function disputeContentProblem(
  content: string,
): 'DISPUTE_CONTENT_REQUIRED' | 'DISPUTE_CONTENT_TOO_LONG' | null {
  const length = content.trim().length;
  if (length === 0) return 'DISPUTE_CONTENT_REQUIRED';
  if (length > DISPUTE_CONTENT_LIMIT) return 'DISPUTE_CONTENT_TOO_LONG';
  return null;
}
