// 이의제기 정책 (C-507, A-104, 11/9 결정, #299). 접수 기한은 서비스 시작 뒤 영업일 기준 48시간이고,
// 방문·노쇼 처리나 취소가 시작보다 늦으면 그때부터 센다. 영업일 계산은 holidays.ts의 addBusinessHours.

/** 접수 기한: 기준 시각부터 영업일 기준 몇 시간 */
export const DISPUTE_DEADLINE_BUSINESS_HOURS = 48;

/** 내용 글자 수(앞뒤 공백 뺀 길이) */
export const DISPUTE_CONTENT_MIN_LENGTH = 10;
export const DISPUTE_CONTENT_MAX_LENGTH = 500;
