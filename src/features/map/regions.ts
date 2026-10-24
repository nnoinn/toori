// 고객이 고를 수 있는 동네 목록 (C-102, #16 R5). 지역을 늘릴 때는 여기에만 더한다.
// code는 shops.sigungu_code와 같은 시·군·구 코드(법정동 코드 앞 5자리, X-502)다.
// 중심 좌표는 카카오 로컬 API 주소 검색으로 그 시·군·구를 찾은 결과다(10/24).
// 화면 코드에서도 쓰므로 서버 전용이 아니다.

export type Region = {
  /** 시·군·구 코드. 예: 41271 */
  code: string;
  /** 화면에 짧게 보여줄 이름. 예: 상록구 */
  name: string;
  /** shops.sigungu와 같은 이름. 예: 안산시 상록구 */
  sigungu: string;
  /** 동네를 골랐을 때 지도·거리 계산의 기준점(WGS84) */
  center: { lat: number; lng: number };
};

export const REGIONS: readonly Region[] = [
  {
    code: '41271',
    name: '상록구',
    sigungu: '안산시 상록구',
    center: { lat: 37.3009718344204, lng: 126.846482563885 },
  },
  {
    code: '41273',
    name: '단원구',
    sigungu: '안산시 단원구',
    center: { lat: 37.321146516162, lng: 126.815325520507 },
  },
];

export function findRegion(code: string): Region | undefined {
  return REGIONS.find((region) => region.code === code);
}
