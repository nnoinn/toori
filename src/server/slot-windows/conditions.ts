// 시간대 매물 쿼리 조건 (#308). 서버에서 쓴다.
// notWindowSlot(): 지금 매물 목록·지도·찜한 샵 목록에서 시간대 안에서 만든 매물을 빼는 조건(정찬형 queries.ts가 넣는다).
// staleWindowHold(): 결제 없이 홀딩이 끝난 시간대 칸(시간을 막지 않고 닫아도 된다, ③).
//   시간대 안 매물은 손님이 [예약하기]를 눌러 만든 칸이라 목록에는 시간대 카드로만 보인다

import { and, eq, exists, isNotNull, isNull, lte, not, or, type SQL, sql } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';

import { favorites, orders, shops, slots } from '@/db/schema';
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

// DB 연결 없이 조건 안의 하위 쿼리만 만든다. 실행할 때 바깥 쿼리와 같은 이름 규칙(snake_case)으로 바뀐다
const queryBuilder = new QueryBuilder({ casing: 'snake_case' });

/** 이 매물에 결제 대기 주문이 있다(결제창을 연 뒤 결과가 아직 정해지지 않음). 바깥 쿼리의 slots를 가리킨다 */
export function hasPendingOrder(): SQL {
  return exists(
    queryBuilder
      .select({ one: sql`1` })
      .from(orders)
      .where(and(eq(orders.slotId, slots.id), eq(orders.status, 'pending'))),
  );
}

/**
 * 결제 없이 홀딩이 끝난 시간대 칸(#308 ③): 시간대 안에서 만든 게시중 매물인데 홀딩이 없거나 끝났고 결제 대기 주문도 없다.
 * 이 칸은 시간을 막지 않고(고객 시작 시각 계산), 마감(hold_released)으로 닫아도 된다. 결제 대기 주문이 있으면
 * (결제는 했는데 확인이 늦는 경우) 결과가 나올 때까지 시간을 막는다. 닫으면 늦게 확인된 정상 결제가 자동 취소되기 때문이다
 */
export function staleWindowHold(now: Date): SQL {
  return and(
    isNotNull(slots.windowId),
    eq(slots.status, 'published'),
    // lte()로 비교해야 시각이 컬럼 형식으로 바뀐다(sql``에 Date를 바로 넣으면 드라이버가 받지 못한다)
    or(isNull(slots.holdExpiresAt), lte(slots.holdExpiresAt, now)),
    not(hasPendingOrder()),
  )!;
}
