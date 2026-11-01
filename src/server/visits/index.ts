// 방문·노쇼 처리 (S-405, 연결 #11). 서버 코드용. 예: import { recordVisitInTx } from '@/server/visits';
// 화면('use client')에서 쓰는 것은 여기 말고 파일에서 직접 가져온다(이 파일은 server-only 파일을 같이 내보내서 화면에서 가져올 수 없다).
// - 방문·노쇼 처리(recordVisit): '@/server/visits/record-visit'
// - 버튼을 보여줄지(canRecordVisit): '@/server/visits/rules'
// - 결과·실패 모양(RecordedVisit, VISIT_ERRORS): '@/server/visits/types', '@/server/visits/errors'

export { VISIT_ERRORS, type VisitErrorCode } from './errors';
export { canRecordVisit, visitBlockReason, type VisitTarget } from './rules';
export type { RecordedVisit, VisitResult } from './types';
export { recordVisitInTx } from './visit-store';
