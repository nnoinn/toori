// 입점 심사 상태 읽기·바꾸기 (DB, 연결 #13, Issue #50 2장, A-101·S-102). 서버에서만 부른다.
// 화면이 부르는 'use server' 함수(review.ts)가 권한·입력을 확인한 뒤 이 함수들을 부른다.
// 'use server' 파일에서 내보내는 함수는 화면에서 바로 부를 수 있으므로, db를 받거나 권한 확인이 없는 함수는 여기에 둔다.

import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import { adminActions, shops } from '@/db/schema';
import type { ShopStatus } from '@/db/schema/shops';
import { fail, ok, type Result } from '@/lib/result';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update'>;

/** 실패 코드와 화면 문구(#50 2장) */
export const SHOP_REVIEW_ERRORS = {
  SHOP_NOT_APPROVED: '입점 승인 후에 매물을 올릴 수 있어요',
  INVALID_STATUS: '지금은 이 작업을 할 수 없어요',
  REASON_REQUIRED: '반려 사유를 입력해 주세요',
  SHOP_NOT_FOUND: '샵을 찾을 수 없어요',
} as const;

export type ShopReviewStatus = {
  status: ShopStatus;
  rejectionReason: string | null;
  /** 입점 신청(다시 신청 포함) 시각 */
  appliedAt: Date;
  /** 승인·반려한 시각. 승인 대기면 null */
  reviewedAt: Date | null;
};

/** 샵의 심사 상태. 샵이 없으면 null */
export async function readShopReviewStatus(
  db: Pick<Db, 'select'>,
  shopId: string,
): Promise<ShopReviewStatus | null> {
  const [row] = await db
    .select({
      status: shops.status,
      rejectionReason: shops.rejectionReason,
      appliedAt: shops.appliedAt,
      reviewedAt: shops.reviewedAt,
    })
    .from(shops)
    .where(eq(shops.id, shopId));
  // status는 DB 제약(shops_status_check)으로 세 값만 들어간다
  return row ? { ...row, status: row.status as ShopStatus } : null;
}

/**
 * 승인된 샵인지 확인한다. 매물 등록·수정·마감·재등록 서버 함수에서 requireShopOwner 다음에 부른다(#50 3장).
 * 그 함수의 트랜잭션 안에서 확인하려면 tx를 넘긴다
 */
export async function assertShopApproved(
  shopId: string,
  db: Pick<Db, 'select'> = getDb(),
): Promise<Result<null>> {
  const review = await readShopReviewStatus(db, shopId);
  if (review?.status !== 'approved') {
    return fail('SHOP_NOT_APPROVED', SHOP_REVIEW_ERRORS.SHOP_NOT_APPROVED);
  }
  return ok(null);
}

/**
 * 승인 대기인 샵을 승인·반려하고 운영자 작업 기록(admin_actions)을 남긴다. 트랜잭션 안에서 부른다.
 * 승인 대기일 때만 바꾸는 조건을 저장 문장에 넣어서, 운영자 둘이 동시에 처리해도 한 번만 바뀐다
 */
export async function reviewShop(
  tx: Db,
  input: { shopId: string; adminId: string } & (
    { decision: 'approve' } | { decision: 'reject'; reason: string }
  ),
): Promise<Result<null>> {
  const rejected = input.decision === 'reject';
  const [updated] = await tx
    .update(shops)
    .set({
      status: rejected ? 'rejected' : 'approved',
      rejectionReason: rejected ? input.reason : null,
      reviewedAt: sql`now()`,
      reviewedBy: input.adminId,
    })
    .where(and(eq(shops.id, input.shopId), eq(shops.status, 'pending')))
    .returning({ id: shops.id });
  if (!updated) {
    return (await readShopReviewStatus(tx, input.shopId))
      ? fail('INVALID_STATUS', SHOP_REVIEW_ERRORS.INVALID_STATUS)
      : fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);
  }

  await tx.insert(adminActions).values({
    adminId: input.adminId,
    action: rejected ? 'shop.reject' : 'shop.approve',
    targetType: 'shop',
    targetId: input.shopId,
    memo: rejected ? input.reason : null,
  });
  return ok(null);
}

/**
 * 반려된 샵을 다시 승인 대기로 돌리고 신청 시각을 새로 쓴다(#13 Q16).
 * 지난 반려 사유·심사 시각은 지운다(반려 이력은 admin_actions에 사유와 함께 남아 있다)
 */
export async function resubmitShop(db: Pick<Db, 'update'>, shopId: string): Promise<Result<null>> {
  const [updated] = await db
    .update(shops)
    .set({
      status: 'pending',
      appliedAt: sql`now()`,
      rejectionReason: null,
      reviewedAt: null,
      reviewedBy: null,
    })
    .where(and(eq(shops.id, shopId), eq(shops.status, 'rejected')))
    .returning({ id: shops.id });
  return updated ? ok(null) : fail('INVALID_STATUS', SHOP_REVIEW_ERRORS.INVALID_STATUS);
}
