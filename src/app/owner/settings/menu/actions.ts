'use server';

// 메뉴·가격표 서버 함수 (O3, S-106). 화면(menu-manager.tsx)에서 부른다.
// 승인 전에도 메뉴를 만들 수 있다(#23 D11). 지우기 대신 숨김만 있다(D12).

import { TransactionRollbackError } from 'drizzle-orm';
import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { fail, ok, type Result, type ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';

import { isServiceTypeOf, type MenuFieldErrors, validateMenu } from './menu';
import {
  insertMenu,
  moveMenu as moveMenuInDb,
  selectMenu,
  selectShopCategory,
  setMenuHidden as setMenuHiddenInDb,
  updateMenu,
} from './menu-store';

const MENU_NOT_FOUND = '메뉴를 찾을 수 없어요';

export type SaveMenuResponse =
  { ok: true } | { ok: false; error: ResultError & { fieldErrors?: MenuFieldErrors } };

/** 메뉴를 더하거나(menuId 없음) 고친다 */
export async function saveMenu(
  shopId: string,
  menuId: string | null,
  input: unknown,
): Promise<SaveMenuResponse> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;

  const db = getDb();
  const category = await selectShopCategory(db, shopId);
  if (!category) return fail('SHOP_NOT_FOUND', '샵을 찾을 수 없어요');

  const checked = validateMenu(category, input);
  if (!checked.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: '입력한 내용을 다시 확인해 주세요',
        fieldErrors: checked.fieldErrors,
      },
    };
  }

  if (menuId === null) {
    await insertMenu(db, shopId, checked.data);
  } else if (!(await updateMenu(db, shopId, menuId, checked.data))) {
    return fail('MENU_NOT_FOUND', MENU_NOT_FOUND);
  }
  refresh();
  return { ok: true };
}

/** 메뉴를 숨기거나 다시 보이게 한다. 지금 업종에 없는 서비스 종류는 다시 보이게 할 수 없다 */
export async function setMenuHidden(
  shopId: string,
  menuId: string,
  hidden: boolean,
): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;

  const db = getDb();
  const [category, menu] = await Promise.all([
    selectShopCategory(db, shopId),
    selectMenu(db, shopId, menuId),
  ]);
  if (!category || !menu) return fail('MENU_NOT_FOUND', MENU_NOT_FOUND);
  if (!hidden && !isServiceTypeOf(category, menu.serviceType)) {
    return fail(
      'SERVICE_TYPE_MISMATCH',
      '지금 업종에 없는 서비스 종류예요. 새 메뉴로 다시 등록해 주세요',
    );
  }

  await setMenuHiddenInDb(db, shopId, menuId, hidden, new Date());
  refresh();
  return ok(null);
}

/** 보이는 메뉴를 한 칸 위·아래로 옮긴다 */
export async function moveMenu(
  shopId: string,
  menuId: string,
  direction: 'up' | 'down',
): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  if (direction !== 'up' && direction !== 'down') return fail('MENU_NOT_FOUND', MENU_NOT_FOUND);

  let moved = false;
  try {
    await getDb().transaction(async (tx) => {
      moved = await moveMenuInDb(tx, shopId, menuId, direction);
      if (!moved) tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  if (!moved) return fail('MENU_NOT_FOUND', MENU_NOT_FOUND);
  refresh();
  return ok(null);
}
