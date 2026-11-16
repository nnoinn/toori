// 시간대 매물 할인율 저장 (DB, 11/16 정민석). 서버에서만 부른다. 권한·입점 승인은 부른 쪽이 먼저 확인한다.
// 고객 [예약하기](server/slot-windows/hold-store.ts acquireWindowHold)는 시간대 줄을 읽기 잠금(for share)하고 서비스 값을
// 복사해 칸을 만든다. 여기서는 시간대 줄을 쓰기 잠금(for update)한 뒤 서비스 할인율·할인가를 바꿔서, 진행 중인 [예약하기]가
// 끝난 뒤에 바꾸고 바꾸는 동안 들어온 [예약하기]는 바꾼 값을 쓴다. 이미 만든 칸(예약·결제 중)은 그대로다

import 'server-only';

import { and, eq, gt, inArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import { slotWindowMenus, slotWindows } from '@/db/schema';
import { fail, ok, type Result } from '@/lib/result';

import {
  planWindowRates,
  WINDOW_RATES_MESSAGES,
  type WindowRatesProblem,
  windowRatesSchema,
} from './window-rates';

type Db = Pick<ReturnType<typeof getDb>, 'transaction'>;

const failWith = (problem: WindowRatesProblem) => fail(problem, WINDOW_RATES_MESSAGES[problem]);

/**
 * 내 샵의 판매 중(게시예정·게시중이고 아직 끝나지 않은) 시간대 서비스 할인율을 바꾼다. 바꾼 서비스 수를 돌려준다.
 * 없거나 남의 시간대면 WINDOW_NOT_FOUND, 마감했거나 시간이 지났으면 WINDOW_CLOSED, 서비스가 다르면 MENUS_CHANGED
 */
export async function updateWindowRatesInDb(
  db: Db,
  shopId: string,
  input: unknown,
  now: Date,
): Promise<Result<{ changed: number }>> {
  const parsed = windowRatesSchema.safeParse(input);
  if (!parsed.success) return failWith('INVALID_INPUT');
  const { windowId, rates } = parsed.data;

  return db.transaction(async (tx) => {
    const [window] = await tx
      .select({ id: slotWindows.id })
      .from(slotWindows)
      .where(
        and(
          eq(slotWindows.id, windowId),
          eq(slotWindows.shopId, shopId),
          inArray(slotWindows.status, ['scheduled', 'published']),
          gt(slotWindows.endAt, now),
        ),
      )
      .for('update');
    if (!window) {
      const [found] = await tx
        .select({ id: slotWindows.id })
        .from(slotWindows)
        .where(and(eq(slotWindows.id, windowId), eq(slotWindows.shopId, shopId)));
      return failWith(found ? 'WINDOW_CLOSED' : 'WINDOW_NOT_FOUND');
    }

    const current = await tx
      .select({
        menuId: slotWindowMenus.menuId,
        listPrice: slotWindowMenus.listPrice,
        discountRate: slotWindowMenus.discountRate,
      })
      .from(slotWindowMenus)
      .where(eq(slotWindowMenus.windowId, windowId));
    const plan = planWindowRates(current, rates);
    if (!plan.ok) return failWith(plan.problem);

    for (const update of plan.updates) {
      await tx
        .update(slotWindowMenus)
        .set({ discountRate: update.discountRate, salePrice: update.salePrice })
        .where(
          and(eq(slotWindowMenus.windowId, windowId), eq(slotWindowMenus.menuId, update.menuId)),
        );
    }
    return ok({ changed: plan.updates.length });
  });
}
