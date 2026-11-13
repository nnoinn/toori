// 원장님 정산 내역 함수가 돌려주는 값 (S-501·S-502, 연결 #10·#20, #129). 시각은 ISO 문자열, 날짜는 한국 날짜 'YYYY-MM-DD'다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { SettlementItemKind, SettlementStatus } from '@/db/schema/settlements';

/**
 * 거래 하나의 정산 상태
 * - scheduled: 지급 예정(payoutDate에 지급). 이의제기 접수 기한이 지나면 그 뒤 첫 목요일에 묶인다
 * - held: 이의제기 중이라 보류. 결론이 나면 돌아오는 지급일에 들어간다(payoutDate는 null)
 * - pending: 묶였고 지급 요청 전 / requested: PG에 지급 요청함 / paid: 지급 완료 / failed: 지급 실패(재요청 예정)
 */
export type SettlementItemStatus = 'scheduled' | 'held' | SettlementStatus;

export type SettlementItemView = {
  reservationId: string;
  reservationCode: string;
  /** sale 이용 완료 / no_show 노쇼 / penalty 고객 취소 위약금 / agreed_cancel 합의 후 취소 */
  kind: SettlementItemKind;
  /** 서비스 시작 시각 */
  startAt: string;
  /** 방문·노쇼 처리 또는 취소 시각. 기간 검색은 이 시각(한국 날짜) 기준이다 */
  occurredAt: string;
  /** 판매가(쿠폰 적용 전). 원장님 정산은 쿠폰과 상관없다 */
  salePrice: number;
  /** 고객 취소·합의 후 취소에 적용한 위약금 비율(%). 이용 완료·노쇼는 null */
  penaltyRate: number | null;
  /** 기준 금액: 이용 완료·노쇼 = 판매가, 고객 취소·합의 후 취소 = 판매가 × 위약금 비율 */
  baseAmount: number;
  /** 플랫폼 수수료율(%). 오픈 기간은 0 */
  platformFeeRate: number;
  platformFee: number;
  platformFeeVat: number;
  /** 결제 수수료율(판매가의 N%). PG 계약 전이라 정해지기 전에는 null("PG 계약 후 확정") */
  paymentFeeRate: number | null;
  paymentFee: number | null;
  paymentFeeVat: number | null;
  /** 이 거래로 받을 금액(패널티를 떼기 전). 결제 수수료율이 정해지기 전에는 null */
  payoutAmount: number | null;
  status: SettlementItemStatus;
  /** 지급일(예정일 포함). 보류면 null */
  payoutDate: string | null;
};

/** getSettlementItems 결과 */
export type SettlementList = {
  /** 기간 안의 거래. 처리·취소 시각이 늦은 것부터 */
  items: SettlementItemView[];
  /** 기간 안 거래의 합계. 결제 수수료율을 모르는 거래가 하나라도 있으면 금액 합계는 null */
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
