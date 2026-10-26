// 고객 위치·동네 쿠키 설정 (C-102, #19 D9). 화면과 서버가 같이 쓴다.
// 위치와 고른 동네는 DB에 저장하지 않고 쿠키에만 둔다.

/**
 * '내 위치 허용'을 보여줄지. 위치를 받으면 saveMyLocation이 위치 이용 기록(logLocationUse, #47 7장)을 남긴다.
 * 위치 기능을 잠시 막아야 할 때(예: 위치기반서비스 신고 전 점검) false로 바꾸면 동네 선택만 남는다.
 */
export const MY_LOCATION_ENABLED = true;

export const LOCATION_COOKIES = {
  /** 고른 동네의 시·군·구 코드 */
  region: 'toori_region',
  /** 내 위치 "위도,경도" */
  myLocation: 'toori_my_location',
} as const;

const DAY_SECONDS = 24 * 60 * 60;

/** 쿠키를 기억하는 기간(초). 동네 1년, 내 위치 하루(10/24 정찬형 결정) */
export const LOCATION_COOKIE_MAX_AGE = {
  region: 365 * DAY_SECONDS,
  myLocation: DAY_SECONDS,
} as const;
