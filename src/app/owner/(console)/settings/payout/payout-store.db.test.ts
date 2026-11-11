// 정산 계좌 화면용 조회가 암호문을 돌려주지 않는지 실제 DB로 본다(O7 ②, S-107, #213).
// 저장(바꾸기·새로 넣기·변경 기록)은 강규민님 changePayoutAccount 테스트(src/server/payouts)가 본다(#295).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { payoutAccounts } from '@/db/schema';

import { createTestShop } from '../../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../../tests/db/test-db';
import { selectPayoutAccount } from './payout-store';

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

  it('계좌 없이 만든 샵이면 null(#213, 화면은 등록 칸을 보여준다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      expect(await selectPayoutAccount(tx, shop.shopId)).toBeNull();
    });
  });
});
