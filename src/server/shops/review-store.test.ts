// 입점 심사 상태 저장과 고객 조회 조건 (#50 2장). 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminActions, shops } from '@/db/schema';
import type { ShopStatus } from '@/db/schema/shops';

import { createTestShop, createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { assertShopApproved, readShopReviewStatus, resubmitShop, reviewShop } from './review-store';
import { customerVisibleShop } from './visibility';

const shopRow = async (tx: TestTx, shopId: string) =>
  (await tx.select().from(shops).where(eq(shops.id, shopId)))[0];

const actionsFor = (tx: TestTx, shopId: string) =>
  tx
    .select({
      adminId: adminActions.adminId,
      action: adminActions.action,
      targetType: adminActions.targetType,
      memo: adminActions.memo,
    })
    .from(adminActions)
    .where(eq(adminActions.targetId, shopId));

describeDb('입점 심사 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('가입 직후 샵은 승인 대기이고 신청 시각이 있다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createTestShop(tx);
      expect(await readShopReviewStatus(tx, shopId)).toMatchObject({
        status: 'pending',
        rejectionReason: null,
        reviewedAt: null,
      });
      expect((await readShopReviewStatus(tx, shopId))?.appliedAt).toBeInstanceOf(Date);
      expect(await readShopReviewStatus(tx, crypto.randomUUID())).toBeNull();
    });
  });

  it('승인하면 상태·심사 시각·심사한 사람을 저장하고 운영자 작업 기록을 남긴다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createTestShop(tx);
      const adminId = await createTestUser(tx);

      expect(await reviewShop(tx, { shopId, adminId, decision: 'approve' })).toEqual({
        ok: true,
        data: null,
      });
      const row = await shopRow(tx, shopId);
      expect(row).toMatchObject({ status: 'approved', rejectionReason: null, reviewedBy: adminId });
      expect(row.reviewedAt).toBeInstanceOf(Date);
      expect(await actionsFor(tx, shopId)).toEqual([
        { adminId, action: 'shop.approve', targetType: 'shop', memo: null },
      ]);
    });
  });

  it('반려하면 사유를 샵과 운영자 작업 기록에 같이 남긴다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createTestShop(tx);
      const adminId = await createTestUser(tx);

      await reviewShop(tx, { shopId, adminId, decision: 'reject', reason: '등록증이 흐려요' });
      expect(await readShopReviewStatus(tx, shopId)).toMatchObject({
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
      });
      expect(await actionsFor(tx, shopId)).toEqual([
        { adminId, action: 'shop.reject', targetType: 'shop', memo: '등록증이 흐려요' },
      ]);
    });
  });

  it('승인 대기가 아니면 바꾸지 않고 기록도 남기지 않는다. 없는 샵이면 SHOP_NOT_FOUND', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      for (const status of ['approved', 'rejected'] as const) {
        const { shopId } = await createTestShop(tx, { status });
        const result = await reviewShop(tx, { shopId, adminId, decision: 'approve' });
        expect(result.ok === false && result.error.code).toBe('INVALID_STATUS');
        expect((await shopRow(tx, shopId)).status).toBe(status);
        expect(await actionsFor(tx, shopId)).toEqual([]);
      }

      const missing = await reviewShop(tx, {
        shopId: crypto.randomUUID(),
        adminId,
        decision: 'reject',
        reason: '사유',
      });
      expect(missing.ok === false && missing.error.code).toBe('SHOP_NOT_FOUND');
    });
  });

  it('반려된 샵을 다시 신청하면 승인 대기로 돌리고 신청 시각을 새로 쓰고 지난 심사 결과를 지운다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const oldAppliedAt = new Date('2026-10-01T00:00:00Z');
      const { shopId } = await createTestShop(tx, {
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
        appliedAt: oldAppliedAt,
        reviewedAt: new Date('2026-10-02T00:00:00Z'),
        reviewedBy: adminId,
      });

      expect((await resubmitShop(tx, shopId)).ok).toBe(true);
      const row = await shopRow(tx, shopId);
      expect(row).toMatchObject({
        status: 'pending',
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
      });
      expect(row.appliedAt.getTime()).toBeGreaterThan(oldAppliedAt.getTime());
    });
  });

  it('반려 상태가 아니면 다시 신청할 수 없다', async () => {
    await withRollback(async (tx) => {
      for (const status of ['pending', 'approved'] as const) {
        const { shopId } = await createTestShop(tx, { status });
        const result = await resubmitShop(tx, shopId);
        expect(result.ok === false && result.error.code).toBe('INVALID_STATUS');
        expect((await shopRow(tx, shopId)).status).toBe(status);
      }
    });
  });

  it('assertShopApproved는 승인된 샵만 통과시킨다', async () => {
    await withRollback(async (tx) => {
      const expected: Record<ShopStatus, boolean> = {
        pending: false,
        approved: true,
        rejected: false,
      };
      for (const [status, passes] of Object.entries(expected) as [ShopStatus, boolean][]) {
        const { shopId } = await createTestShop(tx, { status });
        const result = await assertShopApproved(shopId, tx);
        expect(result.ok).toBe(passes);
        if (!result.ok) expect(result.error.code).toBe('SHOP_NOT_APPROVED');
      }
    });
  });

  it('customerVisibleShop은 승인된 샵만 고른다', async () => {
    await withRollback(async (tx) => {
      const pending = await createTestShop(tx);
      const approved = await createTestShop(tx, { status: 'approved' });
      const rejected = await createTestShop(tx, { status: 'rejected' });

      const visible = await tx
        .select({ id: shops.id })
        .from(shops)
        .where(
          and(
            customerVisibleShop(),
            inArray(shops.id, [pending.shopId, approved.shopId, rejected.shopId]),
          ),
        );
      expect(visible).toEqual([{ id: approved.shopId }]);
    });
  });
});
