// 알림 설정(푸시 구독·관심 동네)의 실패 문구 (연결 #12, #131). 로그인·계정 실패는 AUTH_ERRORS(#47) 그대로 돌려준다.

export const NOTIFICATION_ERRORS = {
  INVALID_INPUT: '알림 설정을 저장하지 못했어요. 다시 시도해 주세요',
  /** 동네 고르기 목록(REGIONS)에 없는 동네 */
  INVALID_REGION: '고를 수 없는 동네예요',
} as const;
