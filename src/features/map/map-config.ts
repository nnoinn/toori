// 홈 지도 설정 (J3, X-503·C-201). 화면 코드에서 쓴다.

/** 첫 확대 정도. 카카오 레벨(숫자가 작을수록 확대). 6이면 동네 하나가 화면에 들어온다(10/24) */
export const MAP_INITIAL_LEVEL = 6;

/** 지도 이동·확대가 끝나고 이만큼 더 움직이지 않으면 보이는 영역을 알린다(요청이 너무 잦지 않게) */
export const MAP_BOUNDS_DEBOUNCE_MS = 300;

/** 이 레벨 이상(더 넓게 볼 때)에서 가까운 마커를 개수로 묶는다 */
export const MAP_CLUSTER_MIN_LEVEL = 5;

export function kakaoMapSdkUrl(appKey: string): string {
  const url = new URL('https://dapi.kakao.com/v2/maps/sdk.js');
  url.searchParams.set('appkey', appKey);
  url.searchParams.set('autoload', 'false');
  url.searchParams.set('libraries', 'clusterer');
  return url.toString();
}
