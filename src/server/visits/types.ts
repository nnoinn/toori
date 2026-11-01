// 방문·노쇼 처리 결과 모양 (연결 #11, #130). 화면과 서버 어디서나 가져올 수 있다.

import type { VisitResult } from '@/db/schema';

export type { VisitResult };

export type RecordedVisit = {
  reservationId: string;
  visitResult: VisitResult;
  /** 처리 시각(서버 시각, ISO 문자열) */
  recordedAt: string;
};
