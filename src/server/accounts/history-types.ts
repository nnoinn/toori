// 계정 이력(#374, 11/13 nnoinn) 결과 모양. 함수(history.ts)·DB 읽기(history-store.ts)·화면 문구(history-texts.ts)가 같이 쓴다.
// 새 표 없이 지금 시각과 함께 남는 기록(샵·매물·시간대·예약·환불·합의 후 취소·쿠폰·이의제기·약관 동의·정산 계좌 변경·정산)을 모은다.
// 화면과 서버 어디서나 가져올 수 있다.

export const ACCOUNT_TYPES = ['owner', 'customer'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * 이력의 일. 원장님 이력과 고객 이력이 같은 이름을 같이 쓰는 것(새 예약·취소·합의 후 취소)도 있다.
 * - 원장님: 입점 신청·승인·반려, 매물 등록·재등록·게시·마감, 시간대 등록·마감, 새 예약, 예약 취소, 합의 후 취소 요청·결과,
 *   방문·노쇼 처리, 정산 계좌 변경, 정산 지급
 * - 고객: 가입, 예약, 예약 취소, 환불, 합의 후 취소 요청 받음·응답, 쿠폰 받음·사용·돌려받음, 이의제기 접수·결론, 알림 동의·철회
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
  'coupon_returned',
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
  /**
   * 마감 사유·반려 메모·취소한 사람·합의 후 취소 사유·환불 사유·쿠폰 받은 사유·쿠폰 돌려받은 사유(환불 사유와 같은 코드)·
   * 정산 계좌 은행·약관 종류 등(코드나 짧은 글)
   */
  reason: string | null;
  /** 방문/노쇼, 합의 후 취소 동의·거절·만료·끝남, 이의제기 결론 등(코드) */
  result: string | null;
};

/** 이력 한 쪽. 쪽 번호는 1부터. 이력이 없어도 쪽 수는 1이다 */
export type AccountHistoryPage = {
  events: AccountHistoryEvent[];
  page: number;
  pageCount: number;
  /** 조건(기간·종류)에 맞는 이력 전체 수 */
  total: number;
};

/** 한 쪽에 보여주는 줄 수(11/15 nnoinn: 20건쯤, 아래에 쪽 번호) */
export const HISTORY_PAGE_SIZE = 20;
/** 고를 수 있는 가장 뒤 쪽. 쪽마다 기록별로 (쪽 × 줄 수)개까지 읽어서, 더 앞선 이력은 기간으로 좁혀 본다 */
export const HISTORY_MAX_PAGE = 250;

/**
 * 이력 종류 묶음(종류 고르기, 11/15 nnoinn). 원래 기록 하나에서 나오는 일(매물 등록·재등록, 입점 승인·반려)은
 * 같은 묶음에 둔다(기록별로 읽고 세기 때문).
 */
export const HISTORY_CATEGORY_KINDS = {
  shop: ['shop_applied', 'shop_approved', 'shop_rejected'],
  slot: [
    'slot_created',
    'slot_relisted',
    'slot_published',
    'slot_closed',
    'window_created',
    'window_closed',
  ],
  reservation: ['reservation_created', 'visit_recorded'],
  cancel: [
    'reservation_cancelled',
    'agreed_cancel_requested',
    'agreed_cancel_resolved',
    'refund_done',
  ],
  settlement: ['payout_account_changed', 'settlement_paid'],
  account: ['signed_up', 'consent_agreed', 'consent_withdrawn'],
  coupon: ['coupon_issued', 'coupon_used', 'coupon_returned'],
  dispute: ['dispute_filed', 'dispute_resolved'],
} as const satisfies Record<string, readonly AccountHistoryKind[]>;
export type HistoryCategory = keyof typeof HISTORY_CATEGORY_KINDS;

/** 계정 종류마다 고를 수 있는 종류 묶음(화면 순서) */
export const ACCOUNT_HISTORY_CATEGORIES: Record<AccountType, readonly HistoryCategory[]> = {
  owner: ['shop', 'slot', 'reservation', 'cancel', 'settlement'],
  customer: ['account', 'reservation', 'cancel', 'coupon', 'dispute'],
};

/** 이력 고르기: 쪽 번호, 기간(한국 날짜 'YYYY-MM-DD', 시작일·끝일 모두 포함), 종류 묶음. 모두 없어도 된다 */
export type AccountHistoryQuery = {
  page?: number;
  from?: string;
  to?: string;
  category?: HistoryCategory;
};
