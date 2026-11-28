// 주간 매물 등록 권유(S-411, 3단계 3-A, 연결 25 #626) 정책 값. 권유 계산(정민석)과 월요일 알림 작업(강규민)이 같이 쓴다.
// 명세 🟡 기본값: 지난 4주 기록에서 많이 팔린 구성을 이번 주 빈 날짜에 최대 3개 권한다.

/** 이 주 수만큼 지난 판매를 본다(이번 주 월요일 0시 전 4주) */
export const WEEKLY_SUGGEST_LOOKBACK_WEEKS = 4;

/** 한 번에 권하는 매물 수 */
export const WEEKLY_SUGGEST_MAX_ITEMS = 3;
