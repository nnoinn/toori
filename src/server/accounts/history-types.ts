// 계정 이력(#374, 11/13 nnoinn) 결과 모양. 함수(history.ts)·DB 읽기(history-store.ts)·화면 문구(history-texts.ts)가 같이 쓴다.
// 새 표 없이 지금 시각과 함께 남는 기록(샵·매물·시간대·예약·환불·합의 후 취소·쿠폰·이의제기·약관 동의·정산 계좌 변경·정산)을 모은다.
// 화면과 서버 어디서나 가져올 수 있다.

export const ACCOUNT_TYPES = ['owner', 'customer'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * 이력의 일. 원장님 이력과 고객 이력이 같은 이름을 같이 쓰는 것(새 예약·취소·합의 후 취소)도 있다.
 * - 원장님: 입점 신청·승인·반려, 매물 등록·재등록·게시·마감, 시간대 등록·마감, 새 예약, 예약 취소, 합의 후 취소 요청·결과,
 *   방문·노쇼 처리, 정산 계좌 변경, 정산 지급
 * - 고객: 가입, 예약, 예약 취소, 환불, 합의 후 취소 요청 받음·응답, 쿠폰 받음·사용, 이의제기 접수·결론, 알림 동의·철회
 */
export const ACCOUNT_HISTORY_KINDS = [
  'shop_applied',
  'shop_approved',
  'shop_rejected',
  'slot_created',
  'slot_relisted',
  'slot_published',
  'slot_closed',
  'window_created',
  'window_closed',
  'reservation_created',
  'reservation_cancelled',
  'agreed_cancel_requested',
  'agreed_cancel_resolved',
  'visit_recorded',
  'payout_account_changed',
  'settlement_paid',
  'signed_up',
  'refund_done',
  'coupon_issued',
  'coupon_used',
  'dispute_filed',
  'dispute_resolved',
  'consent_agreed',
  'consent_withdrawn',
] as const;
export type AccountHistoryKind = (typeof ACCOUNT_HISTORY_KINDS)[number];

/** 이력 한 줄. 화면 문구는 historyText(history-texts.ts)로 만든다 */
export type AccountHistoryEvent = {
  /** 줄 key(일 + 원래 기록 id) */
  key: string;
  /** 일이 일어난 시각(ISO). 최신 순으로 준다 */
  at: string;
  kind: AccountHistoryKind;
  reservationId: string | null;
  reservationCode: string | null;
  menuName: string | null;
  /** 서비스 일시(ISO) */
  startAt: string | null;
  /** 원장님: 판매가·정산 지급액 / 고객: 결제액·환불액·쿠폰 금액 */
  amount: number | null;
  /** 위약금 비율(%) */
  rate: number | null;
  /** 서비스 시작 몇 시간 전에 취소했는지(버림) */
  hoursBeforeStart: number | null;
  /** 마감 사유·반려 메모·취소한 사람·합의 후 취소 사유·환불 사유·쿠폰 사유·정산 계좌 은행·약관 종류 등(코드나 짧은 글) */
  reason: string | null;
  /** 방문/노쇼, 합의 후 취소 동의·거절·만료·끝남, 이의제기 결론 등(코드) */
  result: string | null;
};

/** 이력 한 쪽. 더 앞선 이력이 있으면 nextBefore를 다음에 before로 넘긴다 */
export type AccountHistoryPage = {
  events: AccountHistoryEvent[];
  nextBefore: string | null;
};

/** 한 번에 보여주는 기본 줄 수와 최대 줄 수 */
export const HISTORY_DEFAULT_LIMIT = 30;
export const HISTORY_MAX_LIMIT = 100;
