// 매장 설정 > 정산 계좌 읽기·저장 (DB, O7 ②, S-107). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 원장님 화면에는 은행·예금주·뒷자리 4개만 보여준다. 계좌번호 암호문은 읽지 않는다(전체 번호는 운영자·PG 셀러 등록에서만 푼다).
// 계좌번호는 로그에 남기지 않는다.

import 'server-only';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { payoutAccounts } from '@/db/schema';
import type { BankCode } from '@/server/policy';

type Db = Pick<ReturnType<typeof getDb>, 'select' | 'update'>;

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
 * 정산 계좌를 바꾼다. 계좌번호는 부른 쪽이 encryptAccountNumber로 암호화해서 넘긴다. 그 샵 계좌가 없으면 false.
 * PG 셀러 등록 칸(pg_seller_*)은 건드리지 않는다. 계좌가 바뀔 때 셀러를 다시 등록할지는 셀러 등록(강규민 W20) 때 정한다
 */
export async function updatePayoutAccount(
  db: Pick<Db, 'update'>,
  shopId: string,
  values: {
    bankCode: BankCode;
    accountNumberEncrypted: string;
    accountLast4: string;
    accountHolder: string;
  },
): Promise<boolean> {
  const rows = await db
    .update(payoutAccounts)
    .set(values)
    .where(eq(payoutAccounts.shopId, shopId))
    .returning({ id: payoutAccounts.id });
  return rows.length > 0;
}
