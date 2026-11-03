// 홈 지도 설정 (J3, X-503·C-201). 화면 코드에서 쓴다.

/** 첫 확대 정도. 카카오 레벨(숫자가 작을수록 확대). 6이면 동네 하나가 화면에 들어온다(10/24) */
export const MAP_INITIAL_LEVEL = 6;

/** 지도 이동·확대가 끝나고 이만큼 더 움직이지 않으면 보이는 영역을 알린다(요청이 너무 잦지 않게) */
export const MAP_BOUNDS_DEBOUNCE_MS = 300;

/**
 * 이 레벨 이상(여러 구가 보일 만큼 멀리서 볼 때)에서는 핀 대신 시·군·구마다 하나씩 묶어 매물 수를 보여준다(#204).
 * 7이면 상록구·단원구가 한 화면에 들어온다. 묶음을 누르면 MAP_INITIAL_LEVEL로 확대한다
 */
export const MAP_REGION_GROUP_MIN_LEVEL = 7;

/** 가까이서 볼 때 같은 건물처럼 거의 겹치는 핀만 숫자로 묶는 거리(화면 픽셀, 카카오 기본 60보다 작게, #204) */
export const MAP_OVERLAP_GRID_SIZE = 24;

export function kakaoMapSdkUrl(appKey: string): string {
  const url = new URL('https://dapi.kakao.com/v2/maps/sdk.js');
  url.searchParams.set('appkey', appKey);
  url.searchParams.set('autoload', 'false');
  url.searchParams.set('libraries', 'clusterer');
  return url.toString();
}
