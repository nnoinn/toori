// 시간대 매물 쿼리 조건 (#308). 서버에서 쓴다.
// notWindowSlot(): 지금 매물 목록·지도·찜한 샵 목록에서 시간대 안에서 만든 매물을 빼는 조건(정찬형 queries.ts가 넣는다).
//   시간대 안 매물은 손님이 [예약하기]를 눌러 만든 칸이라 목록에는 시간대 카드로만 보인다

import { eq, isNull, type SQL, sql } from 'drizzle-orm';

import { favorites, shops, slots } from '@/db/schema';
import type { MapBounds } from '@/features/map/types';

/** 시간대 안에서 만든 매물이 아님(한 시술 매물만) */
export function notWindowSlot(): SQL {
  return isNull(slots.windowId);
}

/** 시간대를 찾는 범위: 지도 영역, 시·군·구, 그 고객이 찜한 샵(지금 매물 목록 SlotArea와 같다) */
export type WindowArea = { bounds: MapBounds } | { sigunguCode: string } | { favoritesOf: string };

const float = (value: number) => sql`${value}::float8`;

/** 샵이 그 범위 안. 지금 매물 목록의 범위 조건과 같은 계산이다 */
export function shopInArea(area: WindowArea): SQL {
  if ('bounds' in area) {
    const { sw, ne } = area.bounds;
    return sql`ST_Intersects(${shops.location}::geometry, ST_MakeEnvelope(${float(sw.lng)}, ${float(sw.lat)}, ${float(ne.lng)}, ${float(ne.lat)}, 4326))`;
  }
  if ('sigunguCode' in area) return eq(shops.sigunguCode, area.sigunguCode);
  return sql`${shops.id} in (select ${favorites.shopId} from ${favorites} where ${favorites.customerId} = ${area.favoritesOf})`;
}
