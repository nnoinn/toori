// 이의제기 접수 함수가 돌려주는 값 (연결 #20, #299). 시각은 ISO 문자열이다. 화면과 서버 어디서나 가져올 수 있다.

import type { DisputeOutcome, DisputeStatus, DisputeType } from '@/db/schema/admin';

/**
 * 내 예약 상세의 이의제기 칸. 화면은 시각을 비교하지 않고 이 값으로 고른다(#299).
 * - not_open: 아직 받기 전(예정 예약의 서비스 시작 전). 버튼을 숨긴다
 * - open: 접수할 수 있다
 * - submitted: 이미 접수했다(내용은 dispute)
 * - closed: 접수 기한이 지났다. 버튼 대신 카카오톡 채널 안내
 */
export type DisputeState = 'not_open' | 'open' | 'submitted' | 'closed';

/** 이미 접수한 이의제기 */
export type SubmittedDisputeInfo = {
  type: DisputeType;
  /** open: 투리가 확인 중, resolved: 결론이 났다 */
  status: DisputeStatus;
  createdAt: string;
};

/** getDisputeStatus 결과 */
export type DisputeView = {
  reservationId: string;
  state: DisputeState;
  /** 이 예약에서 고를 수 있는 종류(Q2). no_show는 노쇼 예약만, after_start는 취소되지 않은 예약만 */
  types: DisputeType[];
  /** 접수를 받기 시작하는 때. 예정·이용 완료 예약은 서비스 시작, 취소된 예약은 취소된 때(Q1) */
  opensAt: string;
  /**
   * 접수 기한. 시작·방문·노쇼 처리·취소 중 가장 늦은 때부터 영업일 기준 48시간.
   * 시작 전이거나 시작이 지났는데 원장님이 아직 방문·노쇼 처리를 안 했으면 정해지지 않아서 null
   * (화면 문구 예: "원장님이 방문 처리한 뒤 영업일 기준 48시간까지 접수할 수 있어요")
   */
  deadline: string | null;
  /** 이 예약에 이미 접수한 이의제기. 없으면 null */
  dispute: SubmittedDisputeInfo | null;
  serverNow: string;
};

/** submitDispute 결과 */
export type SubmittedDispute = {
  disputeId: string;
  createdAt: string;
};

// ── 운영자(A-104, W19 ②) ──

/** registerKakaoDispute 입력. receivedAt은 카카오톡 채널에서 받은 시각(ISO, 운영자가 입력) */
export type RegisterKakaoDisputeInput = {
  reservationId: string;
  type: string;
  content: string;
  receivedAt: string;
};

/** registerKakaoDispute 결과 */
export type RegisteredDispute = {
  disputeId: string;
  createdAt: string;
};

/** resolveDispute 입력. memo는 결론 메모(사유, 필수) */
export type ResolveDisputeInput = {
  disputeId: string;
  outcome: string;
  memo: string;
};

/** resolveDispute 결과 */
export type ResolvedDispute = {
  disputeId: string;
  outcome: DisputeOutcome;
  handledAt: string;
};
