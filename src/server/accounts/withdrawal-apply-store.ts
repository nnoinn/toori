// 회원 탈퇴 처리 저장 (#154 본문 2장, 0023). 서버에서만 부른다. withdrawal.ts가 한 트랜잭션 안에서 차례로 부른다.
// 막는 이유 세기는 withdrawal-store.ts(읽기만). 여기서는 잠그고, 지우고, 마감하고, 탈퇴 기록을 남긴다

import 'server-only';

import { and, eq, gt, inArray, isNull, ne, not, or } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  accountWithdrawals,
  coupons,
  customers,
  favorites,
  interestAreas,
  owners,
  profiles,
  pushSubscriptions,
  shops,
  slots,
  slotWindows,
  termsAgreements,
} from '@/db/schema';
import type { ShopStatus } from '@/db/schema/shops';
import { slotIsOnHold, slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { readMyActiveHold, releaseMyHold } from '@/server/payments/hold-store';
import { OPTIONAL_CUSTOMER_TERMS } from '@/server/auth/account-store';
import { closeStaleWindowHolds } from '@/server/slot-windows/store';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * 탈퇴하지 않은 고객 계정 줄을 잠그고 로그인 이메일을 읽는다. 이미 탈퇴했으면 null.
 * 홀딩(acquireHold·acquireWindowHold)도 같은 줄을 잠가서, 탈퇴와 [예약하기]가 겹치면 차례로 처리된다
 */
export async function lockActiveCustomer(
  tx: Tx,
  customerId: string,
): Promise<{ userId: string; email: string | null } | null> {
  const [row] = await tx
    .select({ userId: customers.userId, email: profiles.email })
    .from(customers)
    .innerJoin(profiles, eq(profiles.id, customers.userId))
    .where(and(eq(customers.id, customerId), isNull(customers.withdrawnAt)))
    .for('update');
  return row ?? null;
}

/**
 * 고객 탈퇴(#154 본문 2장): 결제 중이면 홀딩을 풀고, 기한이 남은 안 쓴 쿠폰을 없애고(확인 창의 "쿠폰 N장"과 같은 기준),
 * 관심 동네·찜·고객 푸시 구독을 지우고, 켜져 있는 광고성 동의를 철회로 남기고, 계정을 탈퇴로 바꾸고 탈퇴 기록을 남긴다.
 * lockActiveCustomer로 잠근 뒤, 막는 이유가 없을 때만 부른다
 */
export async function applyCustomerWithdrawal(
  tx: Tx,
  input: { customerId: string; userId: string; now: Date },
): Promise<{ forfeitedCouponCount: number }> {
  const { customerId, userId, now } = input;

  const hold = await readMyActiveHold(tx, { customerId, now });
  if (hold) await releaseMyHold(tx, { slotId: hold.slotId, customerId, now });

  const forfeited = await tx
    .update(coupons)
    .set({ forfeitedAt: now })
    .where(
      and(
        eq(coupons.customerId, customerId),
        isNull(coupons.usedOrderId),
        isNull(coupons.forfeitedAt),
        or(gt(coupons.expiresAt, now), isNull(coupons.forfeitedAt)),
      ),
    )
    .returning({ id: coupons.id });

  await tx.delete(interestAreas).where(eq(interestAreas.customerId, customerId));
  await tx.delete(favorites).where(eq(favorites.customerId, customerId));
  await tx
    .delete(pushSubscriptions)
    .where(
      and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.accountType, 'customer')),
    );
  // 광고성 동의 철회 기록(동의 문구 6-1장의 처리 결과 알림은 로그아웃해서 보이지 않으므로 보내지 않는다)
  await tx
    .update(termsAgreements)
    .set({ withdrawnAt: now })
    .where(
      and(
        eq(termsAgreements.userId, userId),
        eq(termsAgreements.accountType, 'customer'),
        inArray(termsAgreements.termsType, OPTIONAL_CUSTOMER_TERMS),
        isNull(termsAgreements.withdrawnAt),
      ),
    );

  await tx.update(customers).set({ withdrawnAt: now }).where(eq(customers.id, customerId));
  await tx.insert(accountWithdrawals).values({
    userId,
    accountType: 'customer',
    customerId,
    withdrawnAt: now,
    forfeitedCouponCount: forfeited.length,
  });
  return { forfeitedCouponCount: forfeited.length };
}

/** 탈퇴하지 않은 원장님 계정과 그 샵 줄을 잠그고 로그인 이메일·샵 상태를 읽는다. 이미 탈퇴했으면 null */
export async function lockActiveOwnerShop(
  tx: Tx,
  input: { ownerId: string; shopId: string },
): Promise<{ userId: string; email: string | null; shopStatus: ShopStatus } | null> {
  const [row] = await tx
    .select({ userId: owners.userId, email: profiles.email, shopStatus: shops.status })
    .from(shops)
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .innerJoin(profiles, eq(profiles.id, owners.userId))
    .where(
      and(
        eq(shops.id, input.shopId),
        or(eq(owners.id, input.ownerId), ne(owners.id, input.ownerId)),
        isNull(owners.withdrawnAt),
        ne(shops.status, 'withdrawn'),
      ),
    )
    .for('update');
  // status는 DB 제약(shops_status_check)으로 정해진 값만 들어간다
  return row ? { ...row, shopStatus: row.shopStatus as ShopStatus } : null;
}

/**
 * 샵의 판매 전 매물·시간대를 계정 탈퇴로 일괄 마감(account_withdrawal)하고 마감한 수를 돌려준다(#154 본문 1장).
 * 한 시술 매물은 손님이 결제 중(10분 홀딩)이 아닌 것만 닫는다. 시간대는 닫고 결제 없이 끝난 칸을 정리한다.
 * 결제 중인 매물은 탈퇴를 막는 이유라서, 부른 쪽이 마감한 뒤 막는 이유를 다시 세어 그 사이 생겼으면 되돌린다
 */
export async function closeShopOpenSlots(
  tx: Tx,
  input: { shopId: string; now: Date },
): Promise<number> {
  const { shopId, now } = input;
  const closedSlots = await tx
    .update(slots)
    .set({ status: 'closed', closeReason: 'account_withdrawal', closedAt: now })
    .where(
      and(
        eq(slots.shopId, shopId),
        isNull(slots.windowId),
        or(slotStatusIs('scheduled', now), slotStatusIs('published', now)),
        or(not(slotIsOnHold(now)), slotIsOnHold(now)),
      ),
    )
    .returning({ id: slots.id });
  const closedWindows = await tx
    .update(slotWindows)
    .set({ status: 'closed', closeReason: 'account_withdrawal', closedAt: now })
    .where(
      and(
        eq(slotWindows.shopId, shopId),
        inArray(slotWindows.status, ['scheduled', 'published']),
        gt(slotWindows.endAt, now),
      ),
    )
    .returning({ id: slotWindows.id });
  for (const window of closedWindows) {
    await closeStaleWindowHolds(tx, { now, windowId: window.id });
  }
  return closedSlots.length + closedWindows.length;
}

/**
 * 원장님 탈퇴(#154 본문 2장): 샵을 탈퇴(withdrawn)로, 계정을 탈퇴로 바꾸고, 원장님 푸시 구독을 지우고 탈퇴 기록을 남긴다.
 * 매물 일괄 마감(closeShopOpenSlots)과 막는 이유 다시 세기가 끝난 뒤 부른다
 */
export async function applyOwnerWithdrawal(
  tx: Tx,
  input: {
    ownerId: string;
    shopId: string;
    userId: string;
    shopStatusBefore: ShopStatus;
    closedSlotCount: number;
    now: Date;
  },
): Promise<void> {
  const { ownerId, shopId, userId, now } = input;
  await tx.update(shops).set({ status: 'withdrawn' }).where(eq(shops.id, shopId));
  await tx.update(owners).set({ withdrawnAt: now }).where(eq(owners.id, ownerId));
  await tx
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.accountType, 'owner')));
  await tx.insert(accountWithdrawals).values({
    userId,
    accountType: 'owner',
    ownerId,
    withdrawnAt: now,
    shopStatusBefore: input.shopStatusBefore,
    closedSlotCount: input.closedSlotCount,
  });
}

/** 같은 사람 표시를 채운다(이미 있으면 그대로 둔다. 같은 로그인이면 늘 같은 값이다) */
export async function fillIdentityHash(
  tx: Tx,
  input: { userId: string; identityHash: string },
): Promise<void> {
  await tx
    .update(profiles)
    .set({ identityHash: input.identityHash })
    .where(
      and(
        eq(profiles.id, input.userId),
        or(isNull(profiles.identityHash), ne(profiles.identityHash, '')),
      ),
    );
}
