// 정산 계좌 저장이 그 샵 계좌만 바꾸거나(없으면 새로 넣고), 화면용 조회는 암호문을 돌려주지 않는지 실제 DB로 본다(O7 ②, S-107, #213).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { payoutAccounts } from '@/db/schema';

import { createTestShop } from '../../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../../tests/db/test-db';
import { selectPayoutAccount, upsertPayoutAccount } from './payout-store';

afterAll(closeTestDb);

const NEW_ACCOUNT = {
  bankCode: '088',
  accountNumberEncrypted: 'v1:new',
  accountLast4: '2222',
  accountHolder: '새 예금주',
} as const;

async function addAccount(tx: TestTx, shopId: string) {
  await tx.insert(payoutAccounts).values({
    shopId,
    bankCode: '004',
    accountNumberEncrypted: 'v1:old',
    accountLast4: '1111',
    accountHolder: '예전 예금주',
  });
}

describeDb('정산 계좌 (실제 DB)', () => {
  it('화면용 조회는 은행·뒷자리·예금주만 돌려준다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      await addAccount(tx, shop.shopId);
      expect(await selectPayoutAccount(tx, shop.shopId)).toEqual({
        bankCode: '004',
        accountLast4: '1111',
        accountHolder: '예전 예금주',
      });
    });
  });

  it('계좌가 있으면 그 샵 계좌만 바꾸고, PG 셀러 칸은 건드리지 않는다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      await addAccount(tx, mine.shopId);
      await addAccount(tx, other.shopId);
      await tx
        .update(payoutAccounts)
        .set({ pgSellerId: 'seller-1', pgSellerStatus: 'approved' })
        .where(eq(payoutAccounts.shopId, mine.shopId));

      await upsertPayoutAccount(tx, mine.shopId, NEW_ACCOUNT);

      const rows = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, mine.shopId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        ...NEW_ACCOUNT,
        pgSellerId: 'seller-1',
        pgSellerStatus: 'approved',
      });
      expect(await selectPayoutAccount(tx, other.shopId)).toMatchObject({ accountLast4: '1111' });
    });
  });

  it('계좌가 없는 샵이면 새로 넣는다(PG 셀러는 등록 전)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      expect(await selectPayoutAccount(tx, shop.shopId)).toBeNull();

      await upsertPayoutAccount(tx, shop.shopId, NEW_ACCOUNT);

      const [row] = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, shop.shopId));
      expect(row).toMatchObject({ ...NEW_ACCOUNT, pgSellerStatus: 'not_registered' });
    });
  });
});
