// 정산 계좌 바꾸기가 그 샵 계좌만 바꾸고, 화면용 조회는 암호문을 돌려주지 않는지 실제 DB로 본다(O7 ②, S-107).
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
import { selectPayoutAccount, updatePayoutAccount } from './payout-store';

afterAll(closeTestDb);

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

  it('그 샵 계좌만 바꾸고, PG 셀러 칸은 건드리지 않는다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      await addAccount(tx, mine.shopId);
      await addAccount(tx, other.shopId);

      expect(
        await updatePayoutAccount(tx, mine.shopId, {
          bankCode: '088',
          accountNumberEncrypted: 'v1:new',
          accountLast4: '2222',
          accountHolder: '새 예금주',
        }),
      ).toBe(true);

      const [row] = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, mine.shopId));
      expect(row).toMatchObject({
        bankCode: '088',
        accountNumberEncrypted: 'v1:new',
        accountLast4: '2222',
        accountHolder: '새 예금주',
        pgSellerStatus: 'not_registered',
      });
      expect(await selectPayoutAccount(tx, other.shopId)).toMatchObject({ accountLast4: '1111' });
    });
  });

  it('계좌가 없는 샵이면 false', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      expect(
        await updatePayoutAccount(tx, shop.shopId, {
          bankCode: '088',
          accountNumberEncrypted: 'v1:new',
          accountLast4: '2222',
          accountHolder: '새 예금주',
        }),
      ).toBe(false);
    });
  });
});
