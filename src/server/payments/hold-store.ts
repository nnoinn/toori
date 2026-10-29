// 10분 홀딩 저장 (C-404, X-304, #15 W10). 서버에서만 부른다. 트랜잭션 안에서 부른다.
// "게시중이고 홀딩이 없거나 끝난 매물"에만 거는 업데이트를 한 번 실행해서, 두 고객이 같은 매물을 동시에 눌러도 한 명만 된다
// (뒤 사람의 업데이트는 앞 사람이 끝날 때까지 기다린 뒤 조건을 다시 보고 걸린다). 한 고객은 동시에 1개만 홀딩한다.
// 끝난 홀딩은 지우지 않고 시각 비교로 무시한다(예약 작업 없음). now는 서버 시각.
// 매물 상태 조건은 정민석 연결 #16(#57), 신규 고객 조건은 #49, 승인 샵 조건은 #50을 그대로 쓴다.

import 'server-only';

import { and, eq, inArray, not } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, shops, slots } from '@/db/schema';
import { slotIsOnHold, slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { isNewCustomer, newCustomerOnlyVisible } from '@/server/customers';
import { HOLD_MINUTES } from '@/server/policy';
import { customerVisibleShop } from '@/server/shops/visibility';

import { holdBlockReason } from './checkout-rules';
import { readCheckoutSlot } from './checkout-store';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'selectDistinct' | 'update'>;

export type HoldOutcome =
  | { ok: true; holdExpiresAt: Date }
  | { ok: false; code: 'SLOT_NOT_AVAILABLE' | 'HELD_BY_OTHER' | 'NEW_CUSTOMER_ONLY' }
  | { ok: false; code: 'ALREADY_HOLDING'; heldSlotId: string };

/** 지금 살아 있는 내 홀딩(판매 전 매물). 없으면 null */
function myActiveHold(db: Db, customerId: string, now: Date) {
  return db
    .select({ slotId: slots.id, holdExpiresAt: slots.holdExpiresAt })
    .from(slots)
    .where(
      and(eq(slots.holdCustomerId, customerId), slotIsOnHold(now), slotStatusIs('published', now)),
    )
    .limit(1);
}

/**
 * 이 고객이 이 매물을 HOLD_MINUTES 동안 홀딩한다. 이미 같은 매물을 홀딩 중이면 그 홀딩을 그대로 돌려준다(늘리지 않는다).
 * 트랜잭션 안에서 부른다: 예) getDb().transaction((tx) => acquireHold(tx, { slotId, customerId, now }))
 */
export async function acquireHold(
  tx: Db,
  input: { slotId: string; customerId: string; now: Date },
): Promise<HoldOutcome> {
  const { slotId, customerId, now } = input;

  // 같은 고객이 두 매물을 동시에 눌러도 차례로 처리되게 고객 줄을 잠근다(트랜잭션이 끝나면 풀린다)
  await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .for('update');

  const [mine] = await myActiveHold(tx, customerId, now);
  if (mine && mine.slotId !== slotId) {
    return { ok: false, code: 'ALREADY_HOLDING', heldSlotId: mine.slotId };
  }
  if (mine?.holdExpiresAt) return { ok: true, holdExpiresAt: mine.holdExpiresAt };

  const holdExpiresAt = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000);
  const approvedShops = tx.select({ id: shops.id }).from(shops).where(customerVisibleShop());
  const [held] = await tx
    .update(slots)
    .set({ holdCustomerId: customerId, holdExpiresAt })
    .where(
      and(
        eq(slots.id, slotId),
        slotStatusIs('published', now),
        not(slotIsOnHold(now)),
        inArray(slots.shopId, approvedShops),
        newCustomerOnlyVisible(customerId),
      ),
    )
    .returning({ id: slots.id });
  if (held) return { ok: true, holdExpiresAt };

  // 걸리지 않았으면 이유를 고른다
  const slot = await readCheckoutSlot(slotId, tx);
  if (!slot) return { ok: false, code: 'SLOT_NOT_AVAILABLE' };
  const blocked = holdBlockReason(slot, customerId, now);
  if (blocked) return { ok: false, code: blocked };
  if (slot.newCustomerOnly && !(await isNewCustomer(customerId, slot.shopId, tx))) {
    return { ok: false, code: 'NEW_CUSTOMER_ONLY' };
  }
  return { ok: false, code: 'SLOT_NOT_AVAILABLE' };
}

/** 내 홀딩을 푼다(판매 전 매물만). 풀었으면 true, 내 홀딩이 아니었으면 false */
export async function releaseMyHold(
  db: Pick<ReturnType<typeof getDb>, 'update'>,
  input: { slotId: string; customerId: string },
): Promise<boolean> {
  const released = await db
    .update(slots)
    .set({ holdCustomerId: null, holdExpiresAt: null })
    .where(
      and(
        eq(slots.id, input.slotId),
        eq(slots.holdCustomerId, input.customerId),
        inArray(slots.status, ['scheduled', 'published']),
      ),
    )
    .returning({ id: slots.id });
  return released.length > 0;
}
