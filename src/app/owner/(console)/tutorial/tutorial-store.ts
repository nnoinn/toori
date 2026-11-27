// 원장님 튜토리얼 체크 목록(S-412)에 필요한 기록을 읽는다. 새 표 없이 메뉴·매물·시간대 표만 본다(#618 DB 없음).
// 원장님 화면(page.tsx)이 로그인한 원장님의 샵 id로 부른다.

import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '@/db';
import { menus, slots, slotWindows } from '@/db/schema';

import type { TutorialProgress } from './checklist';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 숨기지 않은 메뉴가 있는지, 매물(한 시술·시간대)을 한 번이라도 올렸는지. 매물 상태는 보지 않는다 */
export async function selectTutorialProgress(
  db: Db,
  shopId: string,
): Promise<Pick<TutorialProgress, 'hasMenu' | 'hasListed'>> {
  const [menu, slot, window] = await Promise.all([
    db
      .select({ id: menus.id })
      .from(menus)
      .where(and(eq(menus.shopId, shopId), isNull(menus.hiddenAt)))
      .limit(1),
    db.select({ id: slots.id }).from(slots).where(eq(slots.shopId, shopId)).limit(1),
    db
      .select({ id: slotWindows.id })
      .from(slotWindows)
      .where(eq(slotWindows.shopId, shopId))
      .limit(1),
  ]);
  return { hasMenu: menu.length > 0, hasListed: slot.length > 0 || window.length > 0 };
}
