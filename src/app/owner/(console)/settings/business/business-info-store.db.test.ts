// 사업자 정보가 승인 대기·반려일 때만 저장되고, 반려면 다시 신청까지 되는지 실제 DB로 본다(O7 ②, D19).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { shops } from '@/db/schema';
import { resubmitShop } from '@/server/shops/review-store';

import { createTestShop } from '../../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../../tests/db/test-db';
import { selectBusinessInfo, updateBusinessInfo } from './business-info-store';

afterAll(closeTestDb);

const values = {
  businessName: '바뀐 상호',
  representativeName: '바뀐 대표',
  businessRegistrationNumber: '1112233333',
  openedOn: '2024-05-05',
  businessDocPath: 'shops/new/doc.jpg',
};

describeDb('사업자 정보 저장 (실제 DB)', () => {
  it('승인 대기·반려면 저장하고, 승인됐으면 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const pending = await createTestShop(tx, { status: 'pending' });
      const rejected = await createTestShop(tx, {
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
      });
      const approved = await createTestShop(tx, { status: 'approved' });

      expect(await updateBusinessInfo(tx, pending.shopId, values)).toBe(true);
      expect(await updateBusinessInfo(tx, rejected.shopId, values)).toBe(true);
      expect(await updateBusinessInfo(tx, approved.shopId, values)).toBe(false);

      expect(await selectBusinessInfo(tx, pending.shopId)).toMatchObject({
        ...values,
        status: 'pending',
      });
      expect(await selectBusinessInfo(tx, rejected.shopId)).toMatchObject({
        businessName: '바뀐 상호',
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
      });
      // 승인된 샵은 가입 때 값 그대로
      expect(await selectBusinessInfo(tx, approved.shopId)).toMatchObject({
        businessName: '테스트 미용실',
        status: 'approved',
      });
    });
  });

  it('반려된 샵은 고친 뒤 다시 신청하면 승인 대기가 되고 반려 사유가 지워진다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
      });
      expect(await updateBusinessInfo(tx, shop.shopId, values)).toBe(true);
      expect((await resubmitShop(tx, shop.shopId)).ok).toBe(true);
      expect(await selectBusinessInfo(tx, shop.shopId)).toMatchObject({
        status: 'pending',
        rejectionReason: null,
        businessName: '바뀐 상호',
      });
    });
  });

  it('다른 샵은 그대로다', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      await updateBusinessInfo(tx, mine.shopId, values);
      const [row] = await tx
        .select({ businessName: shops.businessName })
        .from(shops)
        .where(eq(shops.id, other.shopId));
      expect(row.businessName).toBe('테스트 미용실');
    });
  });
});
