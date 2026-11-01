// 입점 심사 조회(A-101)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 목록 상태별·정렬, 상세 필드(계좌는 뒷자리만), 심사 기록을 본다. 다른 테스트의 샵이 같은 DB에 있을 수 있어서 내가 만든 샵만 골라 본다.

import { afterAll, expect, it } from 'vitest';

import { adminActions, payoutAccounts } from '@/db/schema';

import { createTestShop, createTestUser } from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import { countPendingShops, selectShopForReview, selectShopsForReview } from './queries';

const at = (iso: string) => new Date(iso);

describeDb('입점 심사 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('승인 대기는 오래 기다린 순, 반려·승인은 최근 심사 순, 전체는 최근 신청 순', async () => {
    await withRollback(async (tx) => {
      const older = await createTestShop(tx, { appliedAt: at('2026-10-01T00:00:00Z') });
      const newer = await createTestShop(tx, { appliedAt: at('2026-10-05T00:00:00Z') });
      const rejected = await createTestShop(tx, {
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
        appliedAt: at('2026-09-01T00:00:00Z'),
        reviewedAt: at('2026-10-10T00:00:00Z'),
      });
      const mine = new Set([older.shopId, newer.shopId, rejected.shopId]);
      const ids = async (filter: Parameters<typeof selectShopsForReview>[1]) =>
        (await selectShopsForReview(tx, filter))
          .map((row) => row.shopId)
          .filter((id) => mine.has(id));

      expect(await ids('pending')).toEqual([older.shopId, newer.shopId]);
      expect(await ids('rejected')).toEqual([rejected.shopId]);
      expect(await ids('approved')).toEqual([]);
      expect(await ids('all')).toEqual([newer.shopId, older.shopId, rejected.shopId]);

      const [row] = (await selectShopsForReview(tx, 'pending')).filter(
        (r) => r.shopId === older.shopId,
      );
      expect(row).toMatchObject({
        name: '테스트 미용실',
        category: 'hair',
        businessName: '테스트 미용실',
        sigungu: '안산시 단원구',
        status: 'pending',
      });
      expect(await countPendingShops(tx)).toBeGreaterThanOrEqual(2);
    });
  });

  it('상세: 사업자·원장님·샵 정보와 계좌 뒷자리만, 심사 기록은 최근 것부터', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
        reviewedAt: at('2026-10-10T00:00:00Z'),
      });
      await tx.insert(payoutAccounts).values({
        shopId: shop.shopId,
        bankCode: '088',
        accountNumberEncrypted: 'v1:iv:tag:cipher',
        accountLast4: '6789',
        accountHolder: '테스트 원장',
      });
      const admin = await createTestUser(tx);
      await tx.insert(adminActions).values([
        {
          adminId: admin,
          action: 'shop.reject',
          targetType: 'shop',
          targetId: shop.shopId,
          memo: '등록증이 흐려요',
          createdAt: at('2026-10-10T00:00:00Z'),
        },
        {
          adminId: admin,
          action: 'shop.approve',
          targetType: 'shop',
          targetId: shop.shopId,
          createdAt: at('2026-10-12T00:00:00Z'),
        },
      ]);

      const detail = await selectShopForReview(tx, shop.shopId);
      expect(detail).toMatchObject({
        shopId: shop.shopId,
        status: 'rejected',
        rejectionReason: '등록증이 흐려요',
        business: {
          businessName: '테스트 미용실',
          representativeName: '테스트 원장',
          businessRegistrationNumber: '000-00-00000',
          openedOn: '2026-01-01',
        },
        owner: { name: '테스트 원장', phone: '000-0000-0000' },
        shop: { name: '테스트 미용실', category: 'hair', sido: '경기', sigungu: '안산시 단원구' },
        payout: {
          bankCode: '088',
          accountLast4: '6789',
          accountHolder: '테스트 원장',
          pgSellerStatus: 'not_registered',
        },
      });
      expect(JSON.stringify(detail)).not.toContain('cipher');
      expect(detail?.history.map((h) => h.action)).toEqual(['shop.approve', 'shop.reject']);
      expect(detail?.history[1].memo).toBe('등록증이 흐려요');
    });
  });

  it('정산 계좌가 없는 샵은 payout null, 없는 샵은 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      expect((await selectShopForReview(tx, shop.shopId))?.payout).toBeNull();
      expect(await selectShopForReview(tx, crypto.randomUUID())).toBeNull();
    });
  });
});
