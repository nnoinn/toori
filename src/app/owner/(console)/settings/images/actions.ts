'use server';

// 매장 설정 > 사진·링크 서버 함수 (O6, S-104·S-105). 화면(shop-images-manager.tsx, shop-links-form.tsx)에서 부른다.
// 사진은 화면이 강규민님 업로드 주소(createShopImageUploadUrl)로 Storage에 직접 올린 뒤 saveShopImage로 정보를 저장한다(#47, D6).
// 승인 전에도 사진·링크를 입력할 수 있다(#23 D11).

import { refresh } from 'next/cache';
import { z } from 'zod';

import { getDb } from '@/db';
import { fail, ok, type Result, type ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { assertShopImagePath, STORAGE_BUCKETS } from '@/server/storage';
import { createSupabaseAdminClient } from '@/server/supabase/admin';

import {
  imageMenuSchema,
  SHOP_IMAGE_ERRORS,
  type ShopLinkErrors,
  shopImageInputSchema,
  validateShopLinks,
} from './shop-images';
import {
  deleteShopImage as deleteShopImageInDb,
  insertShopImage,
  moveStyleImage,
  setStyleImageMenu,
  updateShopLinks,
} from './shop-images-store';

/** 올린 사진 정보를 저장한다. 대표 사진이면 있던 대표 사진을 바꾼다 */
export async function saveShopImage(shopId: string, input: unknown): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const parsed = shopImageInputSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '사진을 다시 올려 주세요');
  // 경로가 서버가 만든 내 샵 폴더의 것인지 다시 확인한다(다른 샵 사진을 내 것으로 저장하지 못하게)
  const path = await assertShopImagePath(shopId, parsed.data.path);
  if (!path.ok) return path;

  const saved = await insertShopImage(getDb(), shopId, parsed.data);
  if (!saved.ok) {
    // 저장하지 못한 사진은 Storage에서도 지운다
    await removeFiles([parsed.data.path]);
    return saved;
  }
  await removeFiles(saved.data.replacedPaths);
  refresh();
  return ok(null);
}

/** 사진을 지운다(DB와 Storage 둘 다) */
export async function deleteShopImage(shopId: string, imageId: string): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  if (!isUuid(imageId)) return fail('IMAGE_NOT_FOUND', SHOP_IMAGE_ERRORS.NOT_FOUND);

  const path = await deleteShopImageInDb(getDb(), shopId, imageId);
  if (path === null) return fail('IMAGE_NOT_FOUND', SHOP_IMAGE_ERRORS.NOT_FOUND);
  await removeFiles([path]);
  refresh();
  return ok(null);
}

/** 스타일 사진을 한 칸 앞·뒤로 옮긴다 */
export async function moveShopImage(
  shopId: string,
  imageId: string,
  direction: 'up' | 'down',
): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  if (!isUuid(imageId) || (direction !== 'up' && direction !== 'down')) {
    return fail('IMAGE_NOT_FOUND', SHOP_IMAGE_ERRORS.NOT_FOUND);
  }
  if (!(await moveStyleImage(getDb(), shopId, imageId, direction))) {
    return fail('IMAGE_NOT_FOUND', SHOP_IMAGE_ERRORS.NOT_FOUND);
  }
  refresh();
  return ok(null);
}

/** 스타일 사진에 메뉴를 연결하거나 끊는다(menuId null) */
export async function setShopImageMenu(
  shopId: string,
  imageId: string,
  menuId: unknown,
): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  if (!isUuid(imageId)) return fail('IMAGE_NOT_FOUND', SHOP_IMAGE_ERRORS.NOT_FOUND);
  const menu = imageMenuSchema.safeParse(menuId);
  if (!menu.success) return fail('MENU_NOT_FOUND', SHOP_IMAGE_ERRORS.MENU_NOT_FOUND);

  const saved = await setStyleImageMenu(getDb(), shopId, imageId, menu.data);
  if (saved.ok) refresh();
  return saved;
}

export type SaveShopLinksResponse =
  { ok: true } | { ok: false; error: ResultError & { fieldErrors?: ShopLinkErrors } };

/** 인스타그램·네이버 플레이스 주소를 저장한다. 비우면 지운다 */
export async function saveShopLinks(
  shopId: string,
  input: unknown,
): Promise<SaveShopLinksResponse> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const checked = validateShopLinks(input);
  if (!checked.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: '입력한 주소를 다시 확인해 주세요',
        fieldErrors: checked.fieldErrors,
      },
    };
  }
  if (!(await updateShopLinks(getDb(), shopId, checked.data))) {
    return fail('SHOP_NOT_FOUND', '샵을 찾을 수 없어요');
  }
  refresh();
  return { ok: true };
}

function isUuid(value: unknown): value is string {
  return z.uuid().safeParse(value).success;
}

/**
 * Storage에서 파일을 지운다. DB는 이미 바뀌었으므로 실패해도 화면에는 성공으로 보여주고 기록만 남긴다
 * (남은 파일은 고객 화면에 나오지 않는다)
 */
async function removeFiles(paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await createSupabaseAdminClient()
    .storage.from(STORAGE_BUCKETS.shopImages)
    .remove(paths);
  if (error) console.error('[shop-images] Storage 파일 지우기 실패:', paths, error.message);
}
