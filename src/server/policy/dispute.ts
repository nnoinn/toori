// 이의제기 정책 (C-507, A-104, 11/9 결정, #299). 접수 기한은 서비스 시작 뒤 영업일 기준 48시간이고,
// 방문·노쇼 처리나 취소가 시작보다 늦으면 그때부터 센다. 영업일 계산은 holidays.ts의 addBusinessHours.

/** 접수 기한: 기준 시각부터 영업일 기준 몇 시간 */
export const DISPUTE_DEADLINE_BUSINESS_HOURS = 48;

/**
 * 내용의 안전 상한(앞뒤 공백 뺀 길이, 11/13 nnoinn #360 2번). 아주 긴 글로 DB를 채우는 장난을 막는 값이고,
 * 화면에 글자 수로 보여주지 않는다(닿았을 때만 "5,000자까지 쓸 수 있어요"). 빈칸(공백만 있는 것 포함)만 막고 하한은 없다.
 * 서버와 화면은 disputes/rules.ts의 disputeContentProblem으로 같은 기준을 쓴다
 */
export const DISPUTE_CONTENT_LIMIT = 5000;

/**
 * 예전 기준(10~500자). 고객 이의제기 칸(정찬형, #359 4번)이 DISPUTE_CONTENT_LIMIT·disputeContentProblem으로 바꾸면 지운다.
 * 서버는 더 이상 쓰지 않는다
 */
export const DISPUTE_CONTENT_MIN_LENGTH = 10;
export const DISPUTE_CONTENT_MAX_LENGTH = 500;
