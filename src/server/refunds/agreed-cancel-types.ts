// 합의 후 취소가 주고받는 값 (S-410·C-506·X-208, 연결 #19, #301). 시각은 ISO 문자열이다. 화면과 서버 어디서나 가져올 수 있다.

/** 요청 사유(동의 문구 8-1장). 기타면 내용(reasonText)을 같이 받는다. DB check 제약(agreed_cancel_requests)도 이 값을 쓴다 */
export const AGREED_CANCEL_REASONS = ['style_mismatch', 'customer_declined', 'other'] as const;
export type AgreedCancelReason = (typeof AGREED_CANCEL_REASONS)[number];

/** 화면에 보여줄 사유 이름(동의 문구 8-1장) */
export const AGREED_CANCEL_REASON_LABELS: Record<AgreedCancelReason, string> = {
  style_mismatch: '원하는 시술이 예약한 서비스와 달라요',
  customer_declined: '손님이 시술을 원하지 않아요',
  other: '기타',
};

/** 기타 내용 최대 글자 수 */
export const AGREED_CANCEL_REASON_TEXT_MAX = 100;

/**
 * 요청 상태. none: 요청한 적 없음, requested: 손님 답을 기다림, agreed·declined: 손님이 답함,
 * expired: 답할 시간(24시간)이 지남, closed: 손님이 답하기 전에 직접 취소했거나 방문·노쇼 처리돼서 끝남
 */
export const AGREED_CANCEL_STATUSES = [
  'none',
  'requested',
  'agreed',
  'declined',
  'expired',
  'closed',
] as const;
export type AgreedCancelStatus = (typeof AGREED_CANCEL_STATUSES)[number];

/** 요청 한 건(원장님 화면) */
export type AgreedCancelRequestInfo = {
  requestId: string;
  reason: AgreedCancelReason;
  /** 기타일 때 내용. 아니면 null */
  reasonText: string | null;
  requestedAt: string;
  expiresAt: string;
  /** 동의·거절·만료·끝남을 기록한 시각. 답을 기다리는 동안 null */
  respondedAt: string | null;
};

/** getAgreedCancelStatus 결과(원장님 예약 상세, S-410) */
export type AgreedCancelStatusView = {
  reservationId: string;
  /** 가장 최근 요청의 상태. 요청한 적 없으면 none */
  status: AgreedCancelStatus;
  /** [손님과 합의 후 취소]를 열지. 예정 예약이고 방문·노쇼 처리 전이고 답을 기다리는 요청이 없을 때 true(거절·만료 뒤에도 다시 true) */
  canRequest: boolean;
  /** 가장 최근 요청. 요청한 적 없으면 null */
  request: AgreedCancelRequestInfo | null;
  /** 손님이 동의하면 원장님이 정산받는 기준 금액(판매가 × 50%) */
  baseAmount: number;
  serverNow: string;
};

/** requestAgreedCancel 결과 */
export type RequestedAgreedCancel = {
  requestId: string;
  requestedAt: string;
  expiresAt: string;
};

/** getAgreedCancelRequest 결과(고객 예약 상세의 요청 카드, C-506). 답을 기다리는 요청이 없으면 null */
export type PendingAgreedCancel = {
  requestId: string;
  reason: AgreedCancelReason;
  reasonText: string | null;
  /** 동의하면 돌려받는 금액 = 실제 결제액 × 50%(원 미만은 손님 쪽으로 맞춘다) */
  refundAmount: number;
  /** 실제 결제액(쿠폰을 뺀 금액) */
  paidAmount: number;
  /** 쓴 쿠폰. 돌려주지 않아서 안내 문구에만 쓴다 */
  couponAmount: number;
  requestedAt: string;
  expiresAt: string;
  serverNow: string;
};

/** respondAgreedCancel 결과. 동의하면 취소·환불, 동의하지 않으면 예약 그대로 */
export type AgreedCancelResponse =
  | { agreed: true; reservationId: string; refundAmount: number; cancelledAt: string }
  | { agreed: false; reservationId: string; declinedAt: string };
