// 알림·광고성 동의 정책 (연결 #5, Issue #48 6장, C-601, C-602). 시각은 한국 시간이다.

/** 예약 리마인드: 서비스 시작 2시간 전과 15분 전(분, C-602) */
export const REMINDER_MINUTES_BEFORE = [120, 15] as const;

/** 관심 지역 새 매물 알림을 하루 1번 보내는 시각(시, C-601) */
export const INTEREST_DIGEST_HOUR = 13;

/** 광고성 알림을 보내지 않는 시간(시). 21시부터 다음 날 8시 전까지(야간 전송은 별도 동의 필요) */
export const PUSH_QUIET_HOURS = { start: 21, end: 8 } as const;

/** 광고성 정보 수신 동의를 다시 확인하는 주기(개월) */
export const MARKETING_CONSENT_RECHECK_MONTHS = 24;
