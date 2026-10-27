'use server';

// 원장님 프로필(샵 정보) 저장 서버 함수 (O2, S-103). 화면(shop-profile-form.tsx)에서 부른다.
// 승인 전에도 고칠 수 있다(#23 D11). 사업자 정보는 여기서 고치지 않는다(D19).

import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { type GeocodeCandidate, geocodeAddress } from '@/features/map/geocode';
import type { ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';

import { type ShopProfileFieldErrors, validateShopProfile } from './shop-profile';
import { selectShopProfile, updateShopProfile } from './shop-profile-store';

/** 공통 실패 형태에 칸별 문구와 주소 후보만 더했다 */
export type SaveShopProfileError = ResultError & {
  fieldErrors?: ShopProfileFieldErrors;
  /** ADDRESS_AMBIGUOUS일 때 고를 주소 후보. 고르면 그 도로명 주소로 다시 저장한다 */
  candidates?: GeocodeCandidate[];
};

export type SaveShopProfileResponse = { ok: true } | { ok: false; error: SaveShopProfileError };

/** 샵 정보를 저장한다. 주소가 바뀌었을 때만 좌표·지역을 다시 만든다 */
export async function saveShopProfile(
  shopId: string,
  input: unknown,
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
  if (!current)
    return { ok: false, error: { code: 'SHOP_NOT_FOUND', message: '샵을 찾을 수 없어요' } };

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

  const saved = await updateShopProfile(db, shopId, values, location);
  if (!saved)
    return { ok: false, error: { code: 'SHOP_NOT_FOUND', message: '샵을 찾을 수 없어요' } };
  refresh();
  return { ok: true };
}
