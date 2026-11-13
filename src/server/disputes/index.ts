// 이의제기 (C-507, A-104, 연결 #20, #299, #350). 화면이 부르는 함수는 고객 '@/server/disputes/dispute',
// 운영자 '@/server/disputes/admin'에서 가져온다('use server').
// 여기서는 화면과 서버가 같이 쓰는 값과 서버 쪽 계산을 내보낸다. DB 조건(정산 보류 hasOpenDispute)은 '@/server/disputes/conditions'.

export {
  DISPUTE_ERRORS,
  type DisputeError,
  type DisputeErrorCode,
  type DisputeResult,
} from './errors';
export {
  disputeBlockReason,
  disputeContentProblem,
  disputeDeadline,
  disputeOpensAt,
  disputeState,
  type DisputeTarget,
  disputeTypes,
  outcomeBlockReason,
  READY_DISPUTE_OUTCOMES,
} from './rules';
export type * from './types';
