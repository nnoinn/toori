// 정산 계좌 바꾸기의 DB 읽기·저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#295, 마이그레이션 0010).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { payoutAccountChanges, payoutAccounts } from '@/db/schema';

import { createTestShop } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import {
  insertPayoutAccountChange,
  lockPayoutAccount,
  writePayoutAccount,
} from './change-account-store';

type Db = Parameters<typeof lockPayoutAccount>[0];

const ACCOUNT = {
  bankCode: '088',
  accountNumberEncrypted: 'v1:iv:tag:cipher-1',
  accountLast4: '6789',
  accountHolder: '테스트 원장',
};

describeDb('정산 계좌 바꾸기 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('계좌가 없으면 null, 저장하면 새로 넣고, 다시 저장하면 그 줄을 바꾸며 셀러 상태는 건드리지 않는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      expect(await lockPayoutAccount(db, shop.shopId)).toBeNull();

      await writePayoutAccount(db, shop.shopId, ACCOUNT);
      expect(await lockPayoutAccount(db, shop.shopId)).toEqual({
        bankCode: '088',
        accountNumberEncrypted: 'v1:iv:tag:cipher-1',
        accountLast4: '6789',
      });

      await tx
        .update(payoutAccounts)
        .set({ pgSellerId: 'seller-1', pgSellerStatus: 'approved' })
        .where(eq(payoutAccounts.shopId, shop.shopId));
      await writePayoutAccount(db, shop.shopId, {
        bankCode: '004',
        accountNumberEncrypted: 'v1:iv:tag:cipher-2',
        accountLast4: '4321',
        accountHolder: '새 예금주',
      });
      const rows = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, shop.shopId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        bankCode: '004',
        accountNumberEncrypted: 'v1:iv:tag:cipher-2',
        accountLast4: '4321',
        accountHolder: '새 예금주',
        pgSellerId: 'seller-1',
        pgSellerStatus: 'approved',
      });
    });
  });

  it('변경 기록을 남기고 id를 돌려준다. 바꾸기 전 계좌는 비어 있을 수 있다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const shop = await createTestShop(tx, { status: 'approved' });
      const firstId = await insertPayoutAccountChange(db, {
        shopId: shop.shopId,
        changedBy: shop.createdBy,
        previousBankCode: null,
        previousAccountLast4: null,
        bankCode: '088',
        accountLast4: '6789',
      });
      const secondId = await insertPayoutAccountChange(db, {
        shopId: shop.shopId,
        changedBy: shop.createdBy,
        previousBankCode: '088',
        previousAccountLast4: '6789',
        bankCode: '004',
        accountLast4: '4321',
      });

      const rows = await tx
        .select()
        .from(payoutAccountChanges)
        .where(eq(payoutAccountChanges.shopId, shop.shopId));
      expect(rows.map((row) => row.id).sort()).toEqual([firstId, secondId].sort());
      expect(rows.find((row) => row.id === firstId)).toMatchObject({
        changedBy: shop.createdBy,
        previousBankCode: null,
        previousAccountLast4: null,
        bankCode: '088',
        accountLast4: '6789',
      });
      expect(rows.find((row) => row.id === secondId)).toMatchObject({
        previousBankCode: '088',
        previousAccountLast4: '6789',
        bankCode: '004',
        accountLast4: '4321',
      });
    });
  });
});
