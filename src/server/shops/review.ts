'use server';

// 입점 심사 (연결 #13, Issue #50 2장, A-101·S-102). 원장님 승인 대기 화면(정민석)과 운영자 입점 승인 화면에서 부른다.
// 화면에서는 '@/server/shops/review'에서 가져온다. 승인·반려 알림(shop.approved, shop.rejected)은 #15 W16에서 붙인다.

import { z } from 'zod';

import { getDb } from '@/db';
import { fail, ok, type Result } from '@/lib/result';
import { requireAdmin, requireShopOwner } from '@/server/auth';

import {
  readShopReviewStatus,
  resubmitShop,
  reviewShop,
  SHOP_REVIEW_ERRORS,
  type ShopReviewStatus,
} from './review-store';

/** 원장님 본인 샵의 심사 상태(승인 대기 화면, '매물 등록' 메뉴 잠금) */
export async function getShopReviewStatus(shopId: string): Promise<Result<ShopReviewStatus>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const review = await readShopReviewStatus(getDb(), shopId);
  if (!review) return fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);
  return ok(review);
}

/**
 * 반려된 샵을 다시 신청한다(반려 → 승인 대기). 사업자 정보·등록증을 고치는 저장은 원장님 화면 함수에서 먼저 하고
 * 마지막에 이걸 부른다. 반려 상태가 아니면 INVALID_STATUS
 */
export async function resubmitShopForReview(shopId: string): Promise<Result<null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  return resubmitShop(getDb(), shopId);
}

const shopIdSchema = z.uuid();

/** 운영자: 승인 대기인 샵을 승인한다 */
export async function approveShop(shopId: string): Promise<Result<null>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const parsed = shopIdSchema.safeParse(shopId);
  if (!parsed.success) return fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);

  // TODO(#15 W16): 원장님에게 shop.approved 알림
  return getDb().transaction((tx) =>
    reviewShop(tx, { shopId: parsed.data, adminId: auth.data.userId, decision: 'approve' }),
  );
}

const rejectSchema = z.object({ shopId: shopIdSchema, reason: z.string().trim().min(1) });

/** 운영자: 승인 대기인 샵을 반려한다. 사유는 원장님 승인 대기 화면에 그대로 보인다 */
export async function rejectShop(shopId: string, reason: string): Promise<Result<null>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const parsed = rejectSchema.safeParse({ shopId, reason });
  if (!parsed.success) {
    return parsed.error.issues.some((issue) => issue.path[0] === 'shopId')
      ? fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND)
      : fail('REASON_REQUIRED', SHOP_REVIEW_ERRORS.REASON_REQUIRED);
  }

  // TODO(#15 W16): 원장님에게 shop.rejected 알림
  return getDb().transaction((tx) =>
    reviewShop(tx, {
      shopId: parsed.data.shopId,
      adminId: auth.data.userId,
      decision: 'reject',
      reason: parsed.data.reason,
    }),
  );
}
