// 정산 계좌 바꾸기: DB 읽기·저장 (#295, W16 ③). 서버에서만 부른다. 같은 계좌인지 판단은 change-account.ts가 한다.
// 계좌번호는 암호문으로만 다루고 로그에 남기지 않는다.

import 'server-only';

import { eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { payoutAccountChanges, payoutAccounts, shops } from '@/db/schema';

type Tx = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>;

export type CurrentPayoutAccount = {
  bankCode: string;
  accountNumberEncrypted: string;
  accountLast4: string;
};

/**
 * 지금 계좌. 계좌 없이 만든 원장님(#213)이면 null. 트랜잭션 안에서 부른다.
 * 계좌가 아직 없는 샵도 두 저장이 겹쳐 변경 기록이 두 번 남지 않게 샵 줄을 먼저 잠근다
 * (no key update: 매물 등록처럼 이 샵을 가리키는 다른 저장은 막지 않는다)
 */
export async function lockPayoutAccount(
  tx: Tx,
  shopId: string,
): Promise<CurrentPayoutAccount | null> {
  await tx.select({ id: shops.id }).from(shops).where(eq(shops.id, shopId)).for('no key update');
  const [row] = await tx
    .select({
      bankCode: payoutAccounts.bankCode,
      accountNumberEncrypted: payoutAccounts.accountNumberEncrypted,
      accountLast4: payoutAccounts.accountLast4,
    })
    .from(payoutAccounts)
    .where(eq(payoutAccounts.shopId, shopId));
  return row ?? null;
}

/**
 * 계좌를 저장한다. 있으면 바꾸고 없으면 새로 넣는다(샵마다 하나).
 * PG 셀러 등록 칸(pg_seller_*)은 건드리지 않는다. 계좌가 바뀔 때 셀러를 다시 등록할지는 셀러 등록(W20) 때 정한다
 */
export async function writePayoutAccount(
  tx: Tx,
  shopId: string,
  values: {
    bankCode: string;
    accountNumberEncrypted: string;
    accountLast4: string;
    accountHolder: string;
  },
): Promise<void> {
  await tx
    .insert(payoutAccounts)
    .values({ shopId, ...values })
    .onConflictDoUpdate({
      target: payoutAccounts.shopId,
      set: { ...values, updatedAt: new Date() },
    });
}

/** 변경 기록을 한 줄 남기고 그 id를 돌려준다. 은행·뒷자리만 받는다(전체 계좌번호·예금주는 남기지 않는다) */
export async function insertPayoutAccountChange(
  tx: Tx,
  row: {
    shopId: string;
    changedBy: string;
    previousBankCode: string | null;
    previousAccountLast4: string | null;
    bankCode: string;
    accountLast4: string;
  },
): Promise<string> {
  const [saved] = await tx
    .insert(payoutAccountChanges)
    .values(row)
    .returning({ id: payoutAccountChanges.id });
  return saved.id;
}
