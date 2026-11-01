'use server';

// 원장님 프로필(샵 정보) 저장 서버 함수 (O2, S-103). 화면(shop-profile-form.tsx)에서 부른다.
// 승인 전에도 고칠 수 있다(#23 D11). 사업자 정보는 여기서 고치지 않는다(D19).
// 업종은 예약대기·게시중·예약됨 매물이 없을 때만 바꿀 수 있고, 바꾸면 메뉴를 초기화한다(category-change-store.ts, 10/29 결정).
// 화면에서 2단계로 확인받은 뒤에만 한다.

import { TransactionRollbackError } from 'drizzle-orm';
import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { type GeocodeCandidate, geocodeAddress } from '@/features/map/geocode';
import { fail, ok, type Result, type ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';

import {
  type CategoryChangeImpact,
  resetMenusForCategoryChange,
  selectCategoryChangeImpact,
} from './category-change-store';
import {
  CATEGORY_CHANGE_BLOCKED_MESSAGE,
  type ShopProfileFieldErrors,
  validateShopProfile,
} from './shop-profile';
import { selectShopProfile, updateShopProfile } from './shop-profile-store';

const SHOP_NOT_FOUND = { code: 'SHOP_NOT_FOUND', message: '샵을 찾을 수 없어요' };
const ACTIVE_SLOTS = { code: 'ACTIVE_SLOTS', message: CATEGORY_CHANGE_BLOCKED_MESSAGE };

/** 공통 실패 형태에 칸별 문구와 주소 후보만 더했다 */
export type SaveShopProfileError = ResultError & {
  fieldErrors?: ShopProfileFieldErrors;
  /** ADDRESS_AMBIGUOUS일 때 고를 주소 후보. 고르면 그 도로명 주소로 다시 저장한다 */
  candidates?: GeocodeCandidate[];
};

export type SaveShopProfileResponse =
  { ok: true; data: { resetMenus: number } } | { ok: false; error: SaveShopProfileError };

/** 업종을 바꾸기 전에 확인 창에 보여줄 수(막는 매물, 초기화될 메뉴) */
export async function getCategoryChangeImpact(
  shopId: string,
): Promise<Result<CategoryChangeImpact>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const db = getDb();
  const current = await selectShopProfile(db, shopId);
  if (!current) return { ok: false, error: SHOP_NOT_FOUND };
  return ok(await selectCategoryChangeImpact(db, shopId, current.category, new Date()));
}

/**
 * 샵 정보를 저장한다. 주소가 바뀌었을 때만 좌표·지역을 다시 만든다.
 * 업종이 바뀌었으면 confirmCategoryChange가 true일 때만 저장한다. 막는 매물이 있으면 ACTIVE_SLOTS로 거절하고,
 * 없으면 메뉴를 초기화하고 같이 저장한다
 */
export async function saveShopProfile(
  shopId: string,
  input: unknown,
  options: { confirmCategoryChange?: boolean } = {},
): Promise<SaveShopProfileResponse> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;

  const checked = validateShopProfile(input);
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
  const values = checked.data;

  const db = getDb();
  const current = await selectShopProfile(db, shopId);
  if (!current) return { ok: false, error: SHOP_NOT_FOUND };

  const categoryChanged = values.category !== current.category;
  if (categoryChanged && options.confirmCategoryChange !== true) {
    return fail('CATEGORY_CHANGE_NOT_CONFIRMED', '업종 변경을 확인해 주세요');
  }

  let location = null;
  if (values.roadAddress !== current.roadAddress) {
    const geocoded = await geocodeAddress(values.roadAddress);
    // 좌표를 만들지 못하면 저장하지 않는다(지도·거리 계산이 틀어진다, #51)
    if (!geocoded.ok) {
      return {
        ok: false,
        error: { ...geocoded.error, fieldErrors: { roadAddress: geocoded.error.message } },
      };
    }
    location = geocoded.data;
  }

  const now = new Date();
  // 실패하면 tx.rollback()으로 메뉴 초기화까지 모두 되돌리고, 이유는 failure에 남긴다
  let failure = null as SaveShopProfileError | null;
  let changed = { resetMenus: 0 };
  try {
    await db.transaction(async (tx) => {
      if (categoryChanged) {
        const reset = await resetMenusForCategoryChange(tx, shopId, current.category, now);
        if (!reset.ok) {
          failure = ACTIVE_SLOTS;
          tx.rollback();
          return;
        }
        changed = { resetMenus: reset.resetMenus };
      }
      if (!(await updateShopProfile(tx, shopId, values, location))) {
        failure = SHOP_NOT_FOUND;
        tx.rollback();
      }
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  if (failure) return { ok: false, error: failure };

  refresh();
  return { ok: true, data: changed };
}
