// 탈퇴한 계정 되살리기 저장과 조회 (#154 본문 3장, 0023). 서버에서만 부른다.
// 되살리기 함수(withdrawal.ts)와, 30일 안에 탈퇴한 계정이 있으면 새 가입을 막는 가입 함수(src/server/auth)가 쓴다

import 'server-only';

import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';

import type { getDb } from '@/db';
import { accountWithdrawals, customers, owners, shops } from '@/db/schema';
import type { ShopStatus } from '@/db/schema/shops';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;
type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

export type WithdrawalAccountType = 'customer' | 'owner';

/** 되살리지도 지우지도 않은 탈퇴 기록 하나 */
export type OpenWithdrawal = {
  id: string;
  withdrawnAt: Date;
  customerId: string | null;
  ownerId: string | null;
  shopStatusBefore: ShopStatus | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const openOf = (input: { userId: string; accountType: WithdrawalAccountType }) =>
  and(
    eq(accountWithdrawals.userId, input.userId),
    eq(accountWithdrawals.accountType, input.accountType),
    isNull(accountWithdrawals.erasedAt),
  );

function selectOpen(db: DbReader, input: { userId: string; accountType: WithdrawalAccountType }) {
  return db
    .select({
      id: accountWithdrawals.id,
      withdrawnAt: accountWithdrawals.withdrawnAt,
      customerId: accountWithdrawals.customerId,
      ownerId: accountWithdrawals.ownerId,
      shopStatusBefore: accountWithdrawals.shopStatusBefore,
    })
    .from(accountWithdrawals)
    .where(openOf(input))
    .orderBy(desc(accountWithdrawals.withdrawnAt))
    .limit(1);
}

function toOpen(row: Awaited<ReturnType<typeof selectOpen>>[number] | undefined) {
  // shop_status_before는 DB 제약으로 탈퇴 말고 정해진 샵 상태만 들어간다
  return row ? { ...row, shopStatusBefore: row.shopStatusBefore as ShopStatus | null } : null;
}

/**
 * 이 로그인의 그 계정 종류에서 가장 최근의, 되살리지도 지우지도 않은 탈퇴 기록. 없으면 null.
 * 30일이 지났어도 지우기 작업 전이면 돌려준다(기한은 부른 쪽이 본다)
 */
export async function readOpenWithdrawal(
  db: DbReader,
  input: { userId: string; accountType: WithdrawalAccountType },
): Promise<OpenWithdrawal | null> {
  const [row] = await selectOpen(db, input);
  return toOpen(row);
}

/** readOpenWithdrawal과 같고 그 줄을 잠근다(같은 계정을 동시에 두 번 되살리지 않게). 트랜잭션 안에서 부른다 */
export async function lockOpenWithdrawal(
  tx: Tx,
  input: { userId: string; accountType: WithdrawalAccountType },
): Promise<OpenWithdrawal | null> {
  const [row] = await selectOpen(tx, input).for('update');
  return toOpen(row);
}

/** 이 로그인에 그 계정 종류의 탈퇴하지 않은 계정이 있는지 */
export async function hasActiveAccount(
  db: DbReader,
  input: { userId: string; accountType: WithdrawalAccountType },
): Promise<boolean> {
  const rows =
    input.accountType === 'customer'
      ? await db
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.userId, input.userId), isNull(customers.withdrawnAt)))
      : await db
          .select({ id: owners.id })
          .from(owners)
          .where(and(eq(owners.userId, input.userId), isNull(owners.withdrawnAt)));
  return rows.length > 0;
}

/**
 * 되살리기 기간(WITHDRAWAL_RESTORE_DAYS) 안에 그 계정 종류로 탈퇴한 계정이 있는지.
 * 있으면 새로 가입하지 못하고 되살리기만 할 수 있다(#154 본문 3장)
 */
export async function hasRestorableWithdrawal(
  db: DbReader,
  input: { userId: string; accountType: WithdrawalAccountType; now: Date },
): Promise<boolean> {
  const since = new Date(input.now.getTime() - WITHDRAWAL_RESTORE_DAYS * DAY_MS - 1000);
  const rows = await db
    .select({ id: accountWithdrawals.id })
    .from(accountWithdrawals)
    .where(and(openOf(input), gt(accountWithdrawals.withdrawnAt, since)))
    .limit(1);
  return rows.length > 0;
}

/** 고객 계정을 되살린다: 탈퇴 표시를 지우고 탈퇴 기록을 끝낸다. 없어진 쿠폰·철회한 동의는 그대로다 */
export async function restoreCustomerAccount(
  tx: Tx,
  input: { withdrawalId: string; customerId: string; now: Date },
): Promise<void> {
  await tx
    .update(customers)
    .set({ withdrawnAt: null })
    .where(and(eq(customers.id, input.customerId), isNotNull(customers.withdrawnAt)));
  await tx
    .update(accountWithdrawals)
    .set({ restoredAt: null })
    .where(eq(accountWithdrawals.id, input.withdrawalId));
}

/** 원장님 계정을 되살린다: 탈퇴 표시를 지우고 샵을 탈퇴 전 상태로 돌린다. 일괄 마감한 매물은 그대로다 */
export async function restoreOwnerAccount(
  tx: Tx,
  input: { withdrawalId: string; ownerId: string; shopStatusBefore: ShopStatus; now: Date },
): Promise<void> {
  await tx
    .update(owners)
    .set({ withdrawnAt: null })
    .where(and(eq(owners.id, input.ownerId), isNotNull(owners.withdrawnAt)));
  await tx
    .update(shops)
    .set({ status: input.shopStatusBefore === 'pending' ? 'approved' : input.shopStatusBefore })
    .where(and(eq(shops.ownerId, input.ownerId), eq(shops.status, 'withdrawn')));
  await tx
    .update(accountWithdrawals)
    .set({ restoredAt: input.now })
    .where(eq(accountWithdrawals.id, input.withdrawalId));
}
