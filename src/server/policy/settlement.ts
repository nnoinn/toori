// 정산 지급 정책 (X-206, 11/9 결정, #353). 매주 목요일(공휴일이면 다음 영업일)에 지급한다.
// 지급일 계산은 src/server/settlements/payout-date.ts, 영업일은 holidays.ts의 isBusinessDay.

/** 지급 요일(0 일요일 ~ 6 토요일). 목요일. 금요일 하루를 지급 실패 처리에 쓰려고 정했다(11/9) */
export const SETTLEMENT_PAYOUT_WEEKDAY = 4;

/**
 * 지급일 새벽 묶기 작업이 통째로 실패했을 때(배포 중, 서버 장애) 며칠 뒤까지 그 지급일로 따라잡을지(#394 리뷰 3번).
 * 1이면 지급일 다음 날 새벽에 한 번 더 그 지급일 기준(그날 0시)으로 아직 묶지 않은 샵을 묶는다
 */
export const SETTLEMENT_CATCH_UP_DAYS = 1;
