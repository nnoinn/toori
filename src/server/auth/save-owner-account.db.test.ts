// 원장님 가입 저장(saveOwnerAccount, #47 4장)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 원장님 계정·샵·정산 계좌·약관 동의가 한 번에 들어가는지, 시작 상태가 맞는지, 이미 있으면 아무것도 남기지 않는지 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { owners, payoutAccounts, shops, termsAgreements } from '@/db/schema';

import { createTestCustomer, createTestUser, TEST_LOCATION } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { type NewOwnerAccount, saveOwnerAccount } from './account-store';

function newOwner(userId: string, marketing = false): NewOwnerAccount {
  return {
    userId,
    owner: { name: '김원장', phone: '010-0000-0000' },
    shop: {
      name: '투리헤어 중앙점',
      category: 'hair',
      phone: '031-000-0000',
      roadAddress: '경기 안산시 단원구 테스트로 1',
      jibunAddress: null,
      addressDetail: '2층',
      sido: '경기',
      sigungu: '안산시 단원구',
      sigunguCode: '41273',
      location: TEST_LOCATION,
      businessName: '투리헤어',
      representativeName: '김원장',
      businessRegistrationNumber: '0000000000',
      openedOn: '2025-03-01',
      businessDocPath: `users/${userId}/doc.jpg`,
    },
    payout: {
      bankCode: '088',
      accountNumberEncrypted: 'v1:iv:tag:cipher',
      accountLast4: '6789',
      accountHolder: '김원장',
    },
    marketing,
  };
}

const ownerTerms = (tx: TestTx, userId: string) =>
  tx
    .select({ accountType: termsAgreements.accountType, termsType: termsAgreements.termsType })
    .from(termsAgreements)
    .where(eq(termsAgreements.userId, userId));

describeDb('원장님 가입 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('원장님 계정·샵·정산 계좌·약관 동의를 저장하고, 샵은 승인 대기·영업시간 없음·셀러 등록 전으로 시작한다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const saved = await saveOwnerAccount(tx, newOwner(userId));
      expect(saved).toMatchObject({ marketingAgreedAt: null });

      const [owner] = await tx.select().from(owners).where(eq(owners.userId, userId));
      expect(owner).toMatchObject({ id: saved?.ownerId, name: '김원장' });

      const [shop] = await tx.select().from(shops).where(eq(shops.ownerId, owner.id));
      expect(shop).toMatchObject({
        id: saved?.shopId,
        status: 'pending',
        businessHours: [],
        businessDocPath: `users/${userId}/doc.jpg`,
        rejectionReason: null,
        reviewedAt: null,
      });
      expect(shop.appliedAt).toBeInstanceOf(Date);
      expect(shop.location.lat).toBeCloseTo(TEST_LOCATION.lat, 6);

      const [payout] = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, shop.id));
      expect(payout).toMatchObject({
        bankCode: '088',
        accountNumberEncrypted: 'v1:iv:tag:cipher',
        accountLast4: '6789',
        pgSellerStatus: 'not_registered',
      });

      expect(
        (await ownerTerms(tx, userId)).map((row) => `${row.accountType}:${row.termsType}`).sort(),
      ).toEqual(['owner:privacy', 'owner:service', 'owner:supplier']);
    });
  });

  it('광고성 정보 수신에 동의하면 원장님 계정 기준으로 기록하고 동의 시각을 돌려준다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const saved = await saveOwnerAccount(tx, newOwner(userId, true));
      expect(saved?.marketingAgreedAt).toBeInstanceOf(Date);
      expect(await ownerTerms(tx, userId)).toContainEqual({
        accountType: 'owner',
        termsType: 'marketing',
      });
    });
  });

  it('같은 로그인 정보로 고객 계정이 있어도 원장님 계정을 따로 만든다', async () => {
    await withRollback(async (tx) => {
      const { userId } = await createTestCustomer(tx);
      expect(await saveOwnerAccount(tx, newOwner(userId))).not.toBeNull();
    });
  });

  it('이미 원장님 계정이 있으면 null이고 샵·계좌·동의를 더 만들지 않는다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      await saveOwnerAccount(tx, newOwner(userId));
      const shopCount = (await tx.select().from(shops)).length;
      const termsCount = (await ownerTerms(tx, userId)).length;

      expect(await saveOwnerAccount(tx, newOwner(userId, true))).toBeNull();
      expect((await tx.select().from(shops)).length).toBe(shopCount);
      expect((await ownerTerms(tx, userId)).length).toBe(termsCount);
    });
  });
});
