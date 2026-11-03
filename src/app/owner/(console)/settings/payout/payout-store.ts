// 매장 설정 > 정산 계좌 읽기·저장 (DB, O7 ②, S-107, #213). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 원장님 화면에는 은행·예금주·뒷자리 4개만 보여준다. 계좌번호 암호문은 읽지 않는다(전체 번호는 운영자·PG 셀러 등록에서만 푼다).
// 계좌번호는 로그에 남기지 않는다.

import 'server-only';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { payoutAccounts } from '@/db/schema';
import type { BankCode } from '@/server/policy';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>;

export type PayoutAccountView = {
  bankCode: string;
  accountLast4: string;
  accountHolder: string;
};

export async function selectPayoutAccount(
  db: Pick<Db, 'select'>,
  shopId: string,
): Promise<PayoutAccountView | null> {
  const [row] = await db
    .select({
      bankCode: payoutAccounts.bankCode,
      accountLast4: payoutAccounts.accountLast4,
      accountHolder: payoutAccounts.accountHolder,
    })
    .from(payoutAccounts)
    .where(eq(payoutAccounts.shopId, shopId));
  return row ?? null;
}

/**
 * 정산 계좌를 저장한다. 그 샵 계좌가 있으면 바꾸고, 없으면 새로 넣는다(#213, 시드처럼 계좌 없이 만든 원장님).
 * 계좌번호는 부른 쪽이 encryptAccountNumber로 암호화해서 넘긴다.
 * PG 셀러 등록 칸(pg_seller_*)은 건드리지 않는다(새로 넣으면 기본값 '등록 전'). 계좌가 바뀔 때 셀러를 다시 등록할지는 셀러 등록(강규민 W20) 때 정한다
 */
export async function upsertPayoutAccount(
  db: Pick<Db, 'insert'>,
  shopId: string,
  values: {
    bankCode: BankCode;
    accountNumberEncrypted: string;
    accountLast4: string;
    accountHolder: string;
  },
): Promise<void> {
  await db
    .insert(payoutAccounts)
    .values({ shopId, ...values })
    // 샵마다 계좌는 하나(payout_accounts_shop_id_unique). 이미 있으면 그 줄을 바꾼다
    .onConflictDoUpdate({
      target: payoutAccounts.shopId,
      set: { ...values, updatedAt: new Date() },
    });
}
