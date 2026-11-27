// 최근 본 매물(C-212)을 지금 값으로 다시 읽는다. 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 매물 상세와 같은 조건으로만 보여 준다: 승인 샵(#50), 신규 고객 전용(#49), 게시 전이면 빼기.
// 🟡 시작이 지난 매물은 빼고, 예약됨·마감·취소·완료는 흐리게(closed) 보여 준다(docs/stage3-spec.md C-212).
// selectRecentSlots는 DB를 받아서 테스트(withRollback)에서도 같은 조회를 쓸 수 있게 했다

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import { shops, slots } from '@/db/schema';
import { getSlotStatus, type SlotStatus } from '@/features/slot-status/slot-status';
import { newCustomerOnlyVisible } from '@/server/customers';
import { customerVisibleShop } from '@/server/shops/visibility';
import type { SlotWindowDetail } from '@/server/slot-windows';

import type { RecentItem } from './types';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type RecentSlotQuery = {
  slotIds: string[];
  /** 로그인한 고객 계정. 없으면 신규 고객 전용도 거르지 않는다(매물 상세와 같다) */
  customerId: string | null;
  now: Date;
};

export async function selectRecentSlots(
  db: DbReader,
  query: RecentSlotQuery,
): Promise<RecentItem[]> {
  if (query.slotIds.length === 0) return [];
  const rows = await db
    .select({
      slotId: slots.id,
      status: slots.status,
      publishAt: slots.publishAt,
      startAt: slots.startAt,
      menuName: slots.menuName,
      discountRate: slots.discountRate,
      salePrice: slots.salePrice,
      shopName: shops.name,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(
      and(
        inArray(slots.id, query.slotIds),
        customerVisibleShop(),
        newCustomerOnlyVisible(query.customerId),
      ),
    );
  return rows.flatMap((row) => {
    // DB의 check 제약이 6가지 상태만 허용한다
    const status = getSlotStatus({ ...row, status: row.status as SlotStatus }, query.now);
    if (status === 'scheduled') return [];
    if (row.startAt.getTime() <= query.now.getTime()) return [];
    return [
      {
        kind: 'slot' as const,
        id: row.slotId,
        shopName: row.shopName,
        menuName: row.menuName,
        menuCount: 1,
        startAt: row.startAt.toISOString(),
        endAt: null,
        discountRate: row.discountRate,
        salePrice: row.salePrice,
        closed: status !== 'published',
      },
    ];
  });
}

/**
 * 시간대 상세(getSlotWindow, 강규민) 결과를 한 줄로. 지금 시작할 수 있는 서비스만 센다.
 * 볼 수 없는 시간대(마감·끝남 등)는 getSlotWindow가 null을 줘서 여기 오지 않는다. 시간대가 끝났으면 뺀다
 */
export function recentWindowItem(window: SlotWindowDetail, now: Date): RecentItem | null {
  const open = window.menus.filter((menu) => menu.starts.length > 0);
  if (open.length === 0 || new Date(window.endAt).getTime() <= now.getTime()) return null;
  return {
    kind: 'window',
    id: window.windowId,
    shopName: window.shop.name,
    menuName: open[0].name,
    menuCount: open.length,
    startAt: window.startAt,
    endAt: window.endAt,
    discountRate: Math.max(...open.map((menu) => menu.discountRate)),
    salePrice: Math.min(...open.map((menu) => menu.salePrice)),
    closed: false,
  };
}
