// 주간 매물 등록 권유(S-411, 연결 25 #626) 조회. 서버에서만 부른다.
// 월요일 오전 10시 알림 작업(강규민)과 권유를 채워 여는 등록 화면(정민석)이 같이 부른다.
// 샵 승인·탈퇴·게시 멈춤은 여기서 보지 않는다. 알림 작업은 그런 샵에 보내지 않고, 등록 화면은 그런 샵을 먼저 막는다.
// 부르는 쪽이 정한 샵(알림 작업: 대상 샵, 등록 화면: 로그인한 원장님 샵)의 기록만 읽는다

import 'server-only';

import { and, eq, gte, isNull, lt, ne } from 'drizzle-orm';

import type { getDb } from '@/db';
import { reservations, slots } from '@/db/schema';
import { isServiceTypeOf } from '@/server/policy';

import { selectMenus } from '@/app/owner/(console)/settings/menu/menu-store';
import { selectBusyRanges, selectSlotShop } from '@/app/owner/(console)/slots/slot-draft-store';

import {
  busyRange,
  lookbackRange,
  pickWeeklySuggestion,
  type SoldSlot,
  type WeeklySuggestion,
} from './weekly-suggest';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/**
 * 지난 4주에 팔린 매물. 취소·무효가 아닌 예약이 있는 매물이다(노쇼는 정산에 들어가서 판매로 센다).
 * 손님이 시간대 안에서 만든 매물(window_id)도 같은 매물 줄이라 같이 센다
 */
export async function selectSoldSlots(db: Db, shopId: string, now: Date): Promise<SoldSlot[]> {
  const { start, end } = lookbackRange(now);
  return db
    .select({
      startAt: slots.startAt,
      menuId: slots.menuId,
      discountRate: slots.discountRate,
      newCustomerOnly: slots.newCustomerOnly,
    })
    .from(slots)
    .innerJoin(reservations, eq(reservations.slotId, slots.id))
    .where(
      and(
        eq(slots.shopId, shopId),
        gte(slots.startAt, start),
        lt(slots.startAt, end),
        ne(reservations.status, 'cancelled'),
        isNull(reservations.voidedAt),
      ),
    );
}

/** 이번 주 권유. 샵이 없으면 권할 것이 없다(알림을 보내지 않는다) */
export async function suggestWeeklySlots(
  db: Db,
  { shopId, now }: { shopId: string; now: Date },
): Promise<WeeklySuggestion> {
  const busyWindow = busyRange(now);
  const [shop, menuRows, sold, busy] = await Promise.all([
    selectSlotShop(db, shopId),
    selectMenus(db, shopId),
    selectSoldSlots(db, shopId, now),
    selectBusyRanges(db, shopId, busyWindow.start, busyWindow.end),
  ]);
  if (!shop) return { status: 'nothing_to_suggest' };
  return pickWeeklySuggestion({
    now,
    sold,
    // 매물 등록 화면과 같은 메뉴만(숨기지 않았고 지금 업종의 서비스 종류)
    menus: menuRows
      .filter((menu) => !menu.hidden && isServiceTypeOf(shop.category, menu.serviceType))
      .map((menu) => ({ id: menu.id, durationMinutes: menu.durationMinutes })),
    businessHours: shop.businessHours,
    busy,
  });
}
