// 원장님 정산 내역 함수가 돌려주는 값 (S-501·S-502, 연결 #10·#20, #129). 시각은 ISO 문자열, 날짜는 한국 날짜 'YYYY-MM-DD'다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { SettlementItemKind, SettlementStatus } from '@/db/schema/settlements';

/**
 * 거래 하나의 정산 상태
 * - scheduled: 지급 예정(payoutDate에 지급). 이의제기 접수 기한이 지나면 그 뒤 첫 목요일에 묶인다
 * - held: 이의제기 중이라 보류. 결론이 나면 돌아오는 지급일에 들어간다(payoutDate는 null)
 * - pending: 묶였고 지급 요청 전 / requested: PG에 지급 요청함 / paid: 지급 완료 / failed: 지급 실패(재요청 예정)
 * - no_payout: 원장님 사정 취소·무효처럼 정산할 금액이 없는 줄(합계에 넣지 않는다)
 */
export type SettlementItemStatus = 'scheduled' | 'held' | 'no_payout' | SettlementStatus;

/**
 * 정산 내역 한 줄의 종류
 * - sale 이용 완료 / no_show 노쇼 / penalty 고객 취소 위약금 / agreed_cancel 합의 후 취소: 정산 줄이 있는 거래
 * - owner_cancel 원장님 사정 취소(X-207): 기준 금액 0원과 패널티를 보여준다
 * - void 무효(A-108): 기준 금액 0원. 예약 무효 처리를 만들면 나온다
 */
export type SettlementItemViewKind = SettlementItemKind | 'owner_cancel' | 'void';

export type SettlementItemView = {
  reservationId: string;
  reservationCode: string;
  kind: SettlementItemViewKind;
  /** 서비스 시작 시각 */
  startAt: string;
  /** 메뉴(서비스) 이름 */
  menuName: string;
  /** 방문·노쇼 처리 또는 취소 시각. 기간 검색은 이 시각(한국 날짜) 기준이다 */
  occurredAt: string;
  /** 정가 */
  listPrice: number;
  /** 할인율(%) */
  discountRate: number;
  /** 판매가(쿠폰 적용 전). 원장님 정산은 쿠폰과 상관없다 */
  salePrice: number;
  /** 고객 취소·합의 후 취소에 적용한 위약금 비율(%). 그 밖에는 null */
  penaltyRate: number | null;
  /** 고객 취소·원장님 사정 취소면 서비스 시작 몇 시간 전에 취소했는지(시간 단위, 버림). 그 밖에는 null */
  hoursBeforeStart: number | null;
  /** 기준 금액: 이용 완료·노쇼 = 판매가, 고객 취소·합의 후 취소 = 판매가 × 위약금 비율, 원장님 사정 취소·무효 = 0 */
  baseAmount: number;
  /** 플랫폼 수수료율(%). 오픈 기간은 0 */
  platformFeeRate: number;
  platformFee: number;
  platformFeeVat: number;
  /**
   * 결제 수수료율(판매가의 N%). PG 계약 전이라 정해지기 전에는 null("PG 계약 후 확정").
   * 정산할 금액이 없는 줄(no_payout)은 비율이 null이고 금액은 0이다
   */
  paymentFeeRate: number | null;
  paymentFee: number | null;
  paymentFeeVat: number | null;
  /** 이 거래로 받을 금액(패널티를 떼기 전). 결제 수수료율이 정해지기 전에는 null, 정산할 금액이 없는 줄은 0 */
  payoutAmount: number | null;
  /** 쿠폰을 쓴 예약인지. 쿠폰 금액은 투리가 부담해서 원장님 정산과 상관없어 주지 않는다 */
  couponUsed: boolean;
  /** 원장님 사정 취소의 패널티(X-207)와 아직 정산에서 떼지 못한 금액. 그 밖에는 null */
  ownerPenalty: { amount: number; remaining: number } | null;
  /** 이 시각까지 이의제기가 없으면 정산이 확정된다(이의제기 접수 기한) */
  disputeDeadlineAt: string;
  /** 보류 중(held)이면 그 이유. 예: 이의제기 중(11/15 접수) */
  hold: { reason: 'dispute'; receivedAt: string } | null;
  status: SettlementItemStatus;
  /** 지급일(예정일 포함). 보류·정산할 금액이 없는 줄은 null */
  payoutDate: string | null;
};

/** getSettlementItems 결과 */
export type SettlementList = {
  /** 기간 안의 거래. 처리·취소 시각이 늦은 것부터 */
  items: SettlementItemView[];
  /**
   * 기간 안 거래의 합계. 정산할 금액이 없는 줄(no_payout)은 넣지 않는다.
   * 결제 수수료율을 모르는 거래가 하나라도 있으면 금액 합계는 null
   */
  summary: {
    count: number;
    baseAmount: number;
    /** 플랫폼 수수료 + VAT + 결제 수수료 + VAT */
    feeAmount: number | null;
    payoutAmount: number | null;
    /** 이의제기 중 보류 건수 */
    heldCount: number;
  };
  /** 기간과 상관없이 다음에 지급될 묶음(지급 예정·지급 전·지급 요청). 없으면 null */
  nextPayout: { date: string; count: number; payoutAmount: number | null } | null;
  /** 아직 다 걷지 못한 원장님 귀책 취소 패널티(S-409). 다음 정산에서 뗀다 */
  outstandingPenalty: number;
  serverNow: string;
};

/** 정산 계좌. 은행 이름과 끝 4자리만 보여준다(SETTLE-06) */
export type PayoutAccountView = { bankName: string; accountLast4: string };

/** 정산서의 상태. scheduled는 아직 묶이지 않은 지급 예정이고, 나머지는 정산 묶음의 상태다 */
export type SettlementStatementStatus = 'scheduled' | SettlementStatus;

/** 정산서 한 장의 요약 (S-501, 지급일 하나에 한 장) */
export type SettlementStatementSummary = {
  /** 지급일(예정일 포함) */
  payoutDate: string;
  /** 기간: 직전 지급일 다음 날 ~ 지급일. 첫 정산은 처음 거래가 끝난 날부터 */
  periodStart: string;
  periodEnd: string;
  status: SettlementStatementStatus;
  /** 종류별 거래 수 */
  counts: { sale: number; no_show: number; penalty: number; agreed_cancel: number };
  /** 기준 금액 합계 */
  baseAmount: number;
  /** 플랫폼 수수료 + VAT 합계 */
  platformFeeTotal: number;
  /** 결제 수수료 + VAT 합계. 결제 수수료율이 정해지기 전에는 null */
  paymentFeeTotal: number | null;
  /** 이번에 뗀 원장님 귀책 패널티. 지급 예정이면 지금 남은 패널티로 계산한 예상값이고, 정산액을 모르면 null */
  penaltyDeducted: number | null;
  /** 실지급액(패널티를 뗀 뒤). 결제 수수료율이 정해지기 전에는 null */
  payoutAmount: number | null;
  /** 0원이면 이유. penalty_offset: 패널티로 상계해서 0원(지급 요청 없이 지급 완료로 끝낸다, #353) */
  zeroReason: 'penalty_offset' | null;
  /** 지급 완료 시각 */
  paidAt: string | null;
};

/** getSettlementStatement 결과: 정산서 한 장 펼치기 */
export type SettlementStatement = SettlementStatementSummary & {
  /** 이 정산서의 거래(1장 모양). 처리·취소가 늦은 것부터 */
  items: SettlementItemView[];
  /** 이번에 뗀 패널티 건별(원장님 사정 취소 예약번호와 금액). 지급 예정 정산서는 묶을 때 정해져서 비어 있다 */
  penalties: { reservationCode: string; amount: number }[];
  /** 지금 등록된 정산 계좌 */
  payoutAccount: PayoutAccountView | null;
};

/** getSettlementStatements 결과 */
export type SettlementStatementList = {
  /** 지급일이 기간 안인 정산서. 지급일이 늦은 것부터. 아직 묶이지 않은 지급 예정도 같은 모양이다 */
  statements: SettlementStatementSummary[];
  /** 이의제기로 보류 중인 거래(기간과 상관없이). 결론이 나면 그다음 지급일에 들어간다 */
  held: {
    count: number;
    baseAmount: number;
    payoutAmount: number | null;
    items: SettlementItemView[];
  };
  /** 아직 다 걷지 못한 원장님 귀책 취소 패널티 */
  outstandingPenalty: number;
  /** 지금 등록된 정산 계좌 */
  payoutAccount: PayoutAccountView | null;
  serverNow: string;
};
