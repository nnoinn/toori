// 방문·노쇼를 처리할 수 있는지 (S-405, 연결 #11, #130). 화면과 서버 어디서나 가져올 수 있다.
// recordVisit이 이 규칙으로 막고, 원장님 예약 상세(S-403)는 canRecordVisit으로 '방문 완료'·'노쇼' 버튼을 보여줄지 정한다.

import type { ReservationStatus, VisitResult } from '@/db/schema';

import type { VisitErrorCode } from './errors';

export type VisitTarget = {
  status: ReservationStatus;
  visitResult: VisitResult | null;
  /** 매물(서비스) 시작 시각 */
  startAt: Date;
};

/** 지금 처리할 수 없으면 그 실패 코드, 처리할 수 있으면 null. now는 서버 시각(getRequestNow)을 넘긴다 */
export function visitBlockReason(
  target: VisitTarget,
  now: Date,
): Exclude<VisitErrorCode, 'INVALID_INPUT' | 'RESERVATION_NOT_FOUND'> | null {
  if (target.status === 'cancelled') return 'NOT_RESERVED';
  if (target.status === 'completed' || target.visitResult !== null) return 'ALREADY_RECORDED';
  // 시작 시각부터 처리할 수 있다(기술 가이드 S-405 "서비스 시작 시각 이후에만")
  if (now.getTime() < target.startAt.getTime()) return 'TOO_EARLY';
  return null;
}

/** '방문 완료'·'노쇼' 버튼을 보여줄지: 예약됨이고 아직 처리하지 않았고 시작 시각이 지났으면 true */
export function canRecordVisit(target: VisitTarget, now: Date): boolean {
  return visitBlockReason(target, now) === null;
}
