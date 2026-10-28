// 고객에게 보이는 샵 조건 (연결 #13, Issue #50 2장, C-302·J7). 서버에서만 부른다.

import 'server-only';

import { eq, type SQL } from 'drizzle-orm';

import { shops } from '@/db/schema';

/**
 * 입점 승인된 샵만. 고객 목록·지도·상세 조회의 where에 매물 상태 조건(연결 #16), 신규 고객 조건(#49)과 같이 넣는다.
 * 예: .where(and(customerVisibleShop(), eq(slots.status, 'published')))
 */
export function customerVisibleShop(): SQL {
  return eq(shops.status, 'approved');
}
