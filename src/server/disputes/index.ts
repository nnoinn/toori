// 이의제기 (C-507, A-104, 연결 #20, #299). 화면이 부르는 함수는 '@/server/disputes/dispute'에서 가져온다('use server').
// 여기서는 화면과 서버가 같이 쓰는 값과 서버 쪽 계산을 내보낸다.

export {
  DISPUTE_ERRORS,
  type DisputeError,
  type DisputeErrorCode,
  type DisputeResult,
} from './errors';
export {
  disputeBlockReason,
  disputeDeadline,
  disputeOpensAt,
  disputeState,
  type DisputeTarget,
  disputeTypes,
} from './rules';
export type { DisputeState, DisputeView, SubmittedDispute, SubmittedDisputeInfo } from './types';
