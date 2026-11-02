// 홈 지도를 멀리서 볼 때 구 단위 묶음 (#204). 화면에서 쓴다. 화면 없이 테스트한다.
// 지도 영역 안 샵의 매물 수를 시·군·구마다 더한다(목록과 같은 조건: 지도 영역, 필터). 위치는 그 구의 중심(동네 목록)이다.

import { findRegion } from './regions';
import type { LatLng, MapShop } from './types';

export type RegionGroup = {
  /** 시·군·구 코드 */
  code: string;
  /** 동네 목록의 짧은 이름(예: 단원구). 목록에 없는 구는 null */
  name: string | null;
  /** 묶음을 놓을 자리. 동네 목록의 중심, 목록에 없는 구는 그 구 샵들의 가운데 */
  center: LatLng;
  /** 그 구 안의 매물 수 */
  count: number;
};

/** 영역 안 샵을 시·군·구마다 묶는다. 매물 많은 구부터. 구를 모르는 샵(시·군·구 코드 없음)은 뺀다 */
export function groupShopsByRegion(shops: readonly MapShop[]): RegionGroup[] {
  const groups = new Map<string, { count: number; lat: number; lng: number; shops: number }>();
  for (const shop of shops) {
    if (!shop.sigunguCode) continue;
    const group = groups.get(shop.sigunguCode) ?? { count: 0, lat: 0, lng: 0, shops: 0 };
    group.count += shop.slotCount;
    group.lat += shop.lat;
    group.lng += shop.lng;
    group.shops += 1;
    groups.set(shop.sigunguCode, group);
  }
  return [...groups]
    .map(([code, group]) => {
      const region = findRegion(code);
      return {
        code,
        name: region?.name ?? null,
        center: region?.center ?? { lat: group.lat / group.shops, lng: group.lng / group.shops },
        count: group.count,
      };
    })
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}
