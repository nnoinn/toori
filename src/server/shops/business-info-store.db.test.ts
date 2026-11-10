// 운영자의 사업자 정보 수정 저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (#50 4장, W18).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminActions, payoutAccounts, shops } from '@/db/schema';

import { createTestShop, createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { lockBusinessInfo, saveBusinessUpdate } from './business-info-store';

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];
type Db = Parameters<typeof lockBusinessInfo>[0];

async function shopWithPayout(tx: Tx) {
  const shop = await createTestShop(tx, { status: 'approved' });
  await tx.insert(payoutAccounts).values({
    shopId: shop.shopId,
    bankCode: '088',
    accountNumberEncrypted: 'v1:iv:tag:cipher',
    accountLast4: '6789',
    accountHolder: '테스트 원장',
    pgSellerId: 'seller-1',
    pgSellerStatus: 'approved',
    pgSellerCheckedAt: new Date('2026-11-01T00:00:00Z'),
  });
  return shop;
}

describeDb('사업자 정보 수정 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('지금 값과 상태를 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await shopWithPayout(tx);
      expect(await lockBusinessInfo(tx as unknown as Db, shop.shopId)).toEqual({
        status: 'approved',
        businessName: '테스트 미용실',
        representativeName: '테스트 원장',
        businessRegistrationNumber: '000-00-00000',
        openedOn: '2026-01-01',
        businessDocPath: 'test/business-doc.pdf',
      });
      expect(await lockBusinessInfo(tx as unknown as Db, crypto.randomUUID())).toBeNull();
    });
  });

  it('바뀐 칸만 저장하고, 번호가 바뀌면 셀러 상태를 등록 전으로 돌리고, 작업 기록에는 사유와 칸 이름만 남긴다', async () => {
    await withRollback(async (tx) => {
      const shop = await shopWithPayout(tx);
      const adminId = await createTestUser(tx);
      await saveBusinessUpdate(tx as unknown as Db, {
        shopId: shop.shopId,
        adminId,
        values: { businessName: '새 상호', businessRegistrationNumber: '2208187650' },
        changed: ['businessName', 'businessRegistrationNumber'],
        reason: '11/10 카카오톡 문의',
      });

      const [saved] = await tx.select().from(shops).where(eq(shops.id, shop.shopId));
      expect(saved).toMatchObject({
        businessName: '새 상호',
        businessRegistrationNumber: '2208187650',
        representativeName: '테스트 원장',
        status: 'approved',
      });
      const [payout] = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, shop.shopId));
      // 셀러 번호는 남겨서 다시 등록할 때 쓴다
      expect(payout).toMatchObject({
        pgSellerId: 'seller-1',
        pgSellerStatus: 'not_registered',
        pgSellerCheckedAt: null,
      });
      const actions = await tx
        .select()
        .from(adminActions)
        .where(eq(adminActions.targetId, shop.shopId));
      expect(actions).toEqual([
        expect.objectContaining({
          adminId,
          action: 'shop.business_update',
          targetType: 'shop',
          memo: '11/10 카카오톡 문의 (바꾼 항목: 상호, 사업자등록번호)',
        }),
      ]);
    });
  });

  it('번호가 그대로면 셀러 상태를 건드리지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await shopWithPayout(tx);
      await saveBusinessUpdate(tx as unknown as Db, {
        shopId: shop.shopId,
        adminId: await createTestUser(tx),
        values: { representativeName: '새 원장' },
        changed: ['representativeName'],
        reason: '대표자 변경',
      });
      const [payout] = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, shop.shopId));
      expect(payout.pgSellerStatus).toBe('approved');
    });
  });
});
