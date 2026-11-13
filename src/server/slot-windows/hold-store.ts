// 시간대 매물 [예약하기] 홀딩 저장과 결제 없이 끝난 칸 닫기 (C-404·X-304, #308 ③). 서버에서만 부른다.
// - acquireWindowHold: 고른 서비스·시작 시각으로 매물 한 칸(window_id)을 만들어 10분 홀딩한다. 지금 매물 홀딩(acquireHold)과 같은 규칙:
//   한 고객은 동시에 1개만(고객 줄을 잠근다), 신규 고객 전용, 승인된 샵. 두 손님이 같은 시간을 동시에 고르면
//   매물 겹침 제약(slots_no_overlap)이 뒤 사람을 막는다(부른 쪽이 TIME_TAKEN으로 바꾼다)
// - closeStaleWindowHolds: 홀딩이 끝났는데 결제 없이 남은 시간대 칸을 마감(hold_released)으로 닫는다. 결제 대기 주문이 있으면
//   (결제는 했는데 확인이 늦는 경우) 결과가 나올 때까지 닫지 않는다. 닫으면 늦게 확인된 정상 결제가 자동 취소되기 때문이다

import 'server-only';

import { and, eq, gt, inArray, lte } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, shops, slots, slotWindowMenus, slotWindows } from '@/db/schema';
import type { ServiceType } from '@/server/policy';
import { slotIsOnHold, slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { isNewCustomer } from '@/server/customers';
import { HOLD_MINUTES } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

import { staleWindowHold } from './conditions';
import { windowStarts } from './starts';
import { readOccupiedRanges } from './store';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'selectDistinct' | 'insert' | 'update'>;

const MINUTE_MS = 60 * 1000;

/**
 * 결제 없이 끝난 시간대 칸을 마감(hold_released)으로 닫고 닫은 칸을 돌려준다. windowId를 주면 그 시간대 안만 본다.
 * 다른 손님이 그 시간대를 고를 때(acquireWindowHold)와 10분마다 결제 정리 작업이 부른다
 */
export async function closeStaleWindowHolds(
  db: Pick<ReturnType<typeof getDb>, 'update'>,
  input: { now: Date; windowId?: string },
): Promise<{ slotId: string; windowId: string }[]> {
  const rows = await db
    .update(slots)
    .set({ status: 'closed', closeReason: 'hold_released', closedAt: input.now })
    .where(
      and(
        staleWindowHold(input.now),
        input.windowId ? eq(slots.windowId, input.windowId) : undefined,
      ),
    )
    .returning({ slotId: slots.id, windowId: slots.windowId });
  return rows.map((row) => ({ slotId: row.slotId, windowId: row.windowId! }));
}

export type WindowHoldOutcome =
  | { ok: true; slotId: string; holdExpiresAt: Date }
  | { ok: false; code: 'SLOT_NOT_AVAILABLE' | 'NEW_CUSTOMER_ONLY' | 'TIME_TAKEN' }
  | { ok: false; code: 'ALREADY_HOLDING'; heldSlotId: string };

/**
 * 시간대 [예약하기]. 트랜잭션 안에서 부른다: getDb().transaction((tx) => acquireWindowHold(tx, {...})).
 * 이미 같은 시간대·서비스·시작 시각을 내가 홀딩 중이면 그 홀딩을 그대로 돌려준다(늘리지 않는다, holdSlot과 같다).
 * 같은 시간을 다른 손님이 동시에 고르면 매물 겹침 제약이 오류(slots_no_overlap)를 낸다
 */
export async function acquireWindowHold(
  tx: Tx,
  input: { windowId: string; menuId: string; startAt: Date; customerId: string; now: Date },
): Promise<WindowHoldOutcome> {
  const { windowId, menuId, startAt, customerId, now } = input;

  // 같은 고객이 두 칸을 동시에 눌러도 차례로 처리되게 고객 줄을 잠근다(acquireHold와 같다)
  await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .for('update');

  const [mine] = await tx
    .select({
      slotId: slots.id,
      windowId: slots.windowId,
      menuId: slots.menuId,
      startAt: slots.startAt,
      holdExpiresAt: slots.holdExpiresAt,
    })
    .from(slots)
    .where(
      and(eq(slots.holdCustomerId, customerId), slotIsOnHold(now), slotStatusIs('published', now)),
    )
    .limit(1);
  if (mine) {
    const same =
      mine.windowId === windowId &&
      mine.menuId === menuId &&
      mine.startAt.getTime() === startAt.getTime();
    if (same && mine.holdExpiresAt) {
      return { ok: true, slotId: mine.slotId, holdExpiresAt: mine.holdExpiresAt };
    }
    return { ok: false, code: 'ALREADY_HOLDING', heldSlotId: mine.slotId };
  }

  // 원장님이 그 사이 마감하지 못하게 시간대 줄을 읽기 잠금한다(마감은 이 트랜잭션이 끝난 뒤에 이 칸을 보고 남긴다)
  const [window] = await tx
    .select({
      shopId: slotWindows.shopId,
      startAt: slotWindows.startAt,
      endAt: slotWindows.endAt,
      publishAt: slotWindows.publishAt,
      newCustomerOnly: slotWindows.newCustomerOnly,
      createdBy: slotWindows.createdBy,
    })
    .from(slotWindows)
    .innerJoin(shops, eq(shops.id, slotWindows.shopId))
    .where(
      and(
        eq(slotWindows.id, windowId),
        inArray(slotWindows.status, ['scheduled', 'published']),
        lte(slotWindows.publishAt, now),
        gt(slotWindows.endAt, now),
        customerVisibleShop(),
      ),
    )
    .for('share', { of: slotWindows });
  if (!window) return { ok: false, code: 'SLOT_NOT_AVAILABLE' };
  if (window.newCustomerOnly && !(await isNewCustomer(customerId, window.shopId, tx))) {
    return { ok: false, code: 'NEW_CUSTOMER_ONLY' };
  }

  const [menu] = await tx
    .select({
      serviceType: slotWindowMenus.serviceType,
      menuName: slotWindowMenus.menuName,
      menuDescription: slotWindowMenus.menuDescription,
      listPrice: slotWindowMenus.listPrice,
      durationMinutes: slotWindowMenus.durationMinutes,
      discountRate: slotWindowMenus.discountRate,
      salePrice: slotWindowMenus.salePrice,
    })
    .from(slotWindowMenus)
    .where(and(eq(slotWindowMenus.windowId, windowId), eq(slotWindowMenus.menuId, menuId)));
  if (!menu) return { ok: false, code: 'SLOT_NOT_AVAILABLE' };

  // 결제 없이 끝난 칸이 그 시간을 막고 있으면 지금 닫는다(다른 손님이 그 시간을 누르면 그때, #308 ③)
  await closeStaleWindowHolds(tx, { now, windowId });

  const range = { start: window.startAt, end: window.endAt };
  const occupied = await readOccupiedRanges(tx, {
    shopId: window.shopId,
    from: range.start,
    to: range.end,
    now,
  });
  const chosen = windowStarts({
    window: range,
    durationMinutes: menu.durationMinutes,
    occupied,
    now,
  }).find((start) => start.start.getTime() === startAt.getTime());
  if (!chosen) return { ok: false, code: 'TIME_TAKEN' };

  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * MINUTE_MS);
  const [created] = await tx
    .insert(slots)
    .values({
      shopId: window.shopId,
      menuId,
      // DB의 check 제약이 정해진 서비스 종류만 허용한다
      serviceType: menu.serviceType as ServiceType,
      menuName: menu.menuName,
      menuDescription: menu.menuDescription,
      listPrice: menu.listPrice,
      durationMinutes: menu.durationMinutes,
      discountRate: menu.discountRate,
      salePrice: menu.salePrice,
      newCustomerOnly: window.newCustomerOnly,
      startAt: chosen.start,
      endAt: chosen.end,
      // 시간대가 게시된 시각. 시간대 안 칸은 따로 게시하지 않는다
      publishAt: window.publishAt,
      status: 'published',
      holdCustomerId: customerId,
      holdExpiresAt,
      windowId,
      // 칸을 올린 사람은 시간대를 올린 원장님이다(손님은 고르기만 했다)
      createdBy: window.createdBy,
    })
    .returning({ id: slots.id });
  return { ok: true, slotId: created.id, holdExpiresAt };
}
