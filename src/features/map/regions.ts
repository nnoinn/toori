// 고객이 고를 수 있는 동네 목록 (C-102, #16 R5, 전국 시·군·구 #200).
// code는 shops.sigungu_code와 같은 시·군·구 코드(법정동 코드 앞 5자리, X-502)다.
// 목록 자체(region-data.ts)는 scripts/build-regions.mjs가 만든다. 행정구역이 바뀌면 그 스크립트를 다시 돌린다.
// 화면 코드에서도 쓰므로 서버 전용이 아니다.

import { REGION_SIDOS } from './region-data';

export type Region = {
  /** 시·군·구 코드. 예: 41271 */
  code: string;
  /** 화면에 짧게 보여줄 이름. 예: 상록구 */
  name: string;
  /** shops.sigungu와 같은 이름. 예: 안산시 상록구, 종로구. 시·군·구가 없는 세종은 세종특별자치시 */
  sigungu: string;
  /** 시·도 이름. 예: 경기도 */
  sido: string;
  /** 동네를 골랐을 때 지도·거리 계산의 기준점(WGS84) */
  center: { lat: number; lng: number };
};

/** 시·도 하나와 그 안의 시·군·구(동네 고르기의 첫 단계) */
export type RegionSido = {
  /** 시·도 코드(법정동 코드 앞 2자리). 예: 41 */
  code: string;
  /** 예: 경기도 */
  name: string;
  regions: readonly Region[];
};

export { REGION_SIDOS };

/** 전국 시·군·구. 시·도는 이름 순서, 그 안에서는 코드 순서(관심 동네를 돌려주는 순서). 고르는 화면은 이름 순서로 보여 준다 */
export const REGIONS: readonly Region[] = REGION_SIDOS.flatMap((sido) => sido.regions);

const BY_CODE = new Map(REGIONS.map((region) => [region.code, region]));

export function findRegion(code: string): Region | undefined {
  return BY_CODE.get(code);
}

/** 여러 시·도에 같은 이름이 있는 시·군·구(중구·동구·서구·남구·북구·강서구·고성군) */
const SHARED_SIGUNGU = new Set(
  REGIONS.map((region) => region.sigungu).filter(
    (name, index, names) => names.indexOf(name) !== index,
  ),
);

/**
 * 문장·제목에 쓰는 동네 이름. 이름만으로 어느 동네인지 알 수 있게, 다른 시·도에도 같은 이름이 있으면 시·도를 앞에 붙인다.
 * 예: 안산시 단원구, 강남구, 부산광역시 중구
 */
export function regionFullName(region: Region): string {
  return SHARED_SIGUNGU.has(region.sigungu) ? `${region.sido} ${region.sigungu}` : region.sigungu;
}

/** 지금 영업하는 동네. 동네 고르기에서 시·도를 고르지 않고 바로 고를 수 있게 맨 위에 둔다(#200) */
export const FEATURED_REGIONS: readonly Region[] = ['41271', '41273'].map((code) => {
  const region = findRegion(code);
  if (!region) throw new Error(`동네 목록에 ${code}가 없어요`);
  return region;
});
