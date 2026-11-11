// 매장 설정 > 정산 계좌 읽기 (DB, O7 ②, S-107, #213). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 저장은 강규민님 changePayoutAccount(#295, 변경 기록·알림 포함)가 한다(actions.ts).
// 원장님 화면에는 은행·예금주·뒷자리 4개만 보여준다. 계좌번호 암호문은 읽지 않는다(전체 번호는 운영자·PG 셀러 등록에서만 푼다).
// 계좌번호는 로그에 남기지 않는다.

import 'server-only';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { payoutAccounts } from '@/db/schema';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

export type PayoutAccountView = {
  bankCode: string;
  accountLast4: string;
  accountHolder: string;
};

/** 화면에 보여줄 계좌(뒷자리만). 계좌 없이 만든 원장님이면 null(#213) */
export async function selectPayoutAccount(
  db: Db,
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
