// 정산 지급 정책 (X-206, 11/9 결정, #353). 매주 목요일(공휴일이면 다음 영업일)에 지급한다.
// 지급일 계산은 src/server/settlements/payout-date.ts, 영업일은 holidays.ts의 isBusinessDay.

/** 지급 요일(0 일요일 ~ 6 토요일). 목요일. 금요일 하루를 지급 실패 처리에 쓰려고 정했다(11/9) */
export const SETTLEMENT_PAYOUT_WEEKDAY = 4;
