'use server';

// 샵 사진·사업자등록증 업로드 (S-104·S-101, #47 6장). 화면에서는 '@/server/storage/upload'에서 가져온다.
// 서버를 거쳐 올리면 크기 제한(서버 액션 1MB, Vercel 4.5MB)에 걸려서, 서버는 권한 확인과 서명된 업로드 주소 발급만 하고
// 파일은 브라우저가 Storage에 직접 올린다(브라우저 도우미 '@/server/storage/browser'의 uploadToSignedUrl).
// 경로는 서버가 정한다. 실제 형식·크기는 Storage 버킷 설정이 한 번 더 막는다.

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db';
import { shops } from '@/db/schema';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type Result } from '@/lib/result';
import { AUTH_ERRORS, getCurrentAccount, requireShopOwner } from '@/server/auth';
import {
  BUSINESS_DOC_ALLOWED_TYPES,
  BUSINESS_DOC_URL_TTL_SECONDS,
  UPLOAD_ALLOWED_TYPES,
  UPLOAD_MAX_BYTES,
} from '@/server/policy';
import { readShopReviewStatus, SHOP_REVIEW_ERRORS } from '@/server/shops/review-store';
import { createSupabaseAdminClient } from '@/server/supabase/admin';

import {
  type BusinessDocOwner,
  newBusinessDocPath,
  newShopImagePath,
  STORAGE_BUCKETS,
  STORAGE_ERRORS,
} from './paths';

export type SignedUpload = { path: string; token: string; signedUrl: string };

type FileInput = { contentType: string; size: number };

/** 형식·크기 확인. 화면이 보낸 값이라 믿지 않고, 실제 파일은 버킷 설정이 한 번 더 막는다 */
function checkFile<T extends string>(
  input: FileInput,
  types: readonly [T, ...T[]],
  typeError: string,
): Result<T> {
  const type = z.enum(types).safeParse(input?.contentType);
  if (!type.success) return fail('INVALID_FILE_TYPE', typeError);
  const size = z.number().int().positive().max(UPLOAD_MAX_BYTES).safeParse(input.size);
  if (!size.success) return fail('FILE_TOO_LARGE', STORAGE_ERRORS.FILE_TOO_LARGE);
  return ok(type.data);
}

async function signUpload(bucket: string, path: string): Promise<Result<SignedUpload>> {
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(bucket)
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[storage] 업로드 주소 만들기 실패:', bucket, error?.message);
    return fail('UPLOAD_UNAVAILABLE', STORAGE_ERRORS.UPLOAD_UNAVAILABLE);
  }
  return ok({ path: data.path, token: data.token, signedUrl: data.signedUrl });
}

/**
 * 샵 사진 업로드 주소(O6). 본인 샵만. shop-images/{shopId}/… 에 올라간다.
 * 올린 뒤 사진 정보를 DB에 저장하기 전에 assertShopImagePath로 경로를 확인한다
 */
export async function createShopImageUploadUrl(
  input: { shopId: string } & FileInput,
): Promise<Result<SignedUpload>> {
  const auth = await requireShopOwner(input?.shopId);
  if (!auth.ok) return auth;
  const file = checkFile(input, UPLOAD_ALLOWED_TYPES, STORAGE_ERRORS.INVALID_FILE_TYPE);
  if (!file.ok) return file;
  return signUpload(STORAGE_BUCKETS.shopImages, newShopImagePath(auth.data.shopId, file.data));
}

/**
 * 사업자등록증 업로드 주소(O7). 사진(JPG·PNG·WEBP)이나 PDF.
 * - shopId 없음: 원장님 가입 중(로그인 + 원장님 모드 + 아직 원장님 계정 없음) → business-docs/users/{userId}/…
 * - shopId 있음: 본인 샵이고 승인 전(승인 대기·반려)일 때만 → business-docs/shops/{shopId}/…
 *   승인 뒤 사업자 정보는 운영자만 고친다(#50 4장)
 */
export async function createBusinessDocUploadUrl(
  input: { shopId?: string } & FileInput,
): Promise<Result<SignedUpload>> {
  let owner: BusinessDocOwner;
  if (input?.shopId === undefined) {
    const account = await getCurrentAccount();
    if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
    if (account.mode !== 'owner') return fail('WRONG_MODE', AUTH_ERRORS.WRONG_MODE_OWNER);
    if (account.ownerId) return fail('ALREADY_EXISTS', '이미 원장님 계정이 있어요');
    owner = { userId: account.userId };
  } else {
    const auth = await requireShopOwner(input.shopId);
    if (!auth.ok) return auth;
    const review = await readShopReviewStatus(getDb(), auth.data.shopId);
    if (review?.status === 'approved') {
      return fail('INVALID_STATUS', SHOP_REVIEW_ERRORS.INVALID_STATUS);
    }
    owner = { shopId: auth.data.shopId };
  }
  const file = checkFile(input, BUSINESS_DOC_ALLOWED_TYPES, STORAGE_ERRORS.INVALID_DOC_FILE_TYPE);
  if (!file.ok) return file;
  return signUpload(STORAGE_BUCKETS.businessDocs, newBusinessDocPath(owner, file.data));
}

/**
 * 사업자등록증을 잠깐 여는 주소(운영자 입점 승인 화면, 원장님 본인). 비공개 버킷이라 BUSINESS_DOC_URL_TTL_SECONDS 뒤 닫힌다.
 * 관리자이거나, 원장님 모드로 들어온 그 샵 주인만
 */
export async function getBusinessDocUrl(
  shopId: string,
): Promise<Result<{ url: string; expiresAt: Date }>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const isShopOwner =
    account.mode === 'owner' && account.shopId !== null && account.shopId === shopId;
  if (!account.isAdmin && !isShopOwner) return fail('FORBIDDEN', AUTH_ERRORS.FORBIDDEN);

  const id = z.uuid().safeParse(shopId);
  if (!id.success) return fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);
  const [shop] = await getDb()
    .select({ businessDocPath: shops.businessDocPath })
    .from(shops)
    .where(eq(shops.id, id.data));
  if (!shop) return fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);

  const now = await getRequestNow();
  const { data, error } = await createSupabaseAdminClient()
    .storage.from(STORAGE_BUCKETS.businessDocs)
    .createSignedUrl(shop.businessDocPath, BUSINESS_DOC_URL_TTL_SECONDS);
  if (error || !data) return fail('DOC_NOT_FOUND', STORAGE_ERRORS.DOC_NOT_FOUND);
  return ok({
    url: data.signedUrl,
    expiresAt: new Date(now.getTime() + BUSINESS_DOC_URL_TTL_SECONDS * 1000),
  });
}
