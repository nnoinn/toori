// 쿠폰 DB 읽기·쓰기 (C-407, #300). 서버에서만 부른다. 규칙 판단은 rules.ts가 한다.
// 원장님 귀책 취소 때 쿠폰 발급·돌려주기(X-207)도 여기에 더한다.

import 'server-only';

import { and, asc, eq, gt, isNull } from 'drizzle-orm';

import type { getDb } from '@/db';
import { coupons } from '@/db/schema';

import type { CouponRow } from './rules';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

const couponColumns = {
  couponId: coupons.id,
  amount: coupons.amount,
  expiresAt: coupons.expiresAt,
  usedOrderId: coupons.usedOrderId,
};

/** 내가 지금 쓸 수 있는 쿠폰: 안 썼고 기한이 남은 것(기한 빠른 순) */
export async function readUsableCoupons(
  db: Pick<Db, 'select'>,
  input: { customerId: string; now: Date },
): Promise<CouponRow[]> {
  return db
    .select(couponColumns)
    .from(coupons)
    .where(
      and(
        eq(coupons.customerId, input.customerId),
        isNull(coupons.usedOrderId),
        gt(coupons.expiresAt, input.now),
      ),
    )
    .orderBy(asc(coupons.expiresAt));
}

/** 내 쿠폰 한 장(쓴 것·기한 지난 것 포함). 내 쿠폰이 아니면 null */
export async function readMyCoupon(
  db: Pick<Db, 'select'>,
  input: { couponId: string; customerId: string },
): Promise<CouponRow | null> {
  const [row] = await db
    .select(couponColumns)
    .from(coupons)
    .where(and(eq(coupons.id, input.couponId), eq(coupons.customerId, input.customerId)));
  return row ?? null;
}

/**
 * 결제를 확정하면서 쿠폰을 그 주문에 쓴 것으로 바꾼다. 트랜잭션 안에서 부른다.
 * 아직 안 쓴 쿠폰일 때만 바꾸므로 두 결제가 같은 쿠폰으로 동시에 확정돼도 하나만 성공한다. 바꿨으면 true
 */
export async function markCouponUsed(
  tx: Pick<Db, 'update'>,
  input: { couponId: string; orderId: string; usedAt: Date },
): Promise<boolean> {
  const updated = await tx
    .update(coupons)
    .set({ usedOrderId: input.orderId, usedAt: input.usedAt })
    .where(and(eq(coupons.id, input.couponId), isNull(coupons.usedOrderId)))
    .returning({ id: coupons.id });
  return updated.length > 0;
}
