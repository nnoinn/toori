// 탈퇴 30일 뒤 개인정보 지우기 저장과 조회(#154 본문 4장, 0023)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 차례와 실패 처리는 withdrawal-erase.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  accountWithdrawals,
  customers,
  menus,
  owners,
  payoutAccounts,
  profiles,
  shopImages,
  shops,
} from '@/db/schema';

import { createTestCustomer, createTestShop } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  eraseCustomerData,
  eraseOwnerData,
  ERASED_NAME,
  forgetProfileEmail,
  lockDueWithdrawal,
  readDueWithdrawals,
  readProfilesToForget,
} from './withdrawal-erase-store';

const NOW = new Date('2026-11-24T13:00:00+09:00');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);
const BEFORE = daysAgo(30);

async function withdrawCustomer(tx: TestTx, withdrawnAt: Date) {
  const customer = await createTestCustomer(tx);
  await tx
    .update(customers)
    .set({ withdrawnAt, phone: '010-0000-0000' })
    .where(eq(customers.id, customer.customerId));
  const [row] = await tx
    .insert(accountWithdrawals)
    .values({
      userId: customer.userId,
      accountType: 'customer',
      customerId: customer.customerId,
      withdrawnAt,
    })
    .returning({ id: accountWithdrawals.id });
  return { ...customer, withdrawalId: row.id };
}

async function withdrawOwner(tx: TestTx, withdrawnAt: Date) {
  const shop = await createTestShop(tx, { status: 'withdrawn', description: '샵 소개' });
  const [{ ownerId }] = await tx
    .select({ ownerId: shops.ownerId })
    .from(shops)
    .where(eq(shops.id, shop.shopId));
  await tx.update(owners).set({ withdrawnAt }).where(eq(owners.id, ownerId));
  const [row] = await tx
    .insert(accountWithdrawals)
    .values({
      userId: shop.createdBy,
      accountType: 'owner',
      ownerId,
      withdrawnAt,
      shopStatusBefore: 'approved',
    })
    .returning({ id: accountWithdrawals.id });
  return { ...shop, ownerId, withdrawalId: row.id };
}

describeDb('탈퇴 30일 뒤 개인정보 지우기 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('되살리지도 지우지도 않았고 30일이 지난 탈퇴 기록만 오래된 순서로 읽는다', async () => {
    await withRollback(async (tx) => {
      const old = await withdrawCustomer(tx, daysAgo(45));
      const exact = await withdrawCustomer(tx, daysAgo(30));
      const recent = await withdrawCustomer(tx, new Date(daysAgo(30).getTime() + 1000));
      const restored = await withdrawCustomer(tx, daysAgo(40));
      await tx
        .update(accountWithdrawals)
        .set({ restoredAt: daysAgo(35) })
        .where(eq(accountWithdrawals.id, restored.withdrawalId));
      const erased = await withdrawCustomer(tx, daysAgo(50));
      await tx
        .update(accountWithdrawals)
        .set({ erasedAt: daysAgo(20) })
        .where(eq(accountWithdrawals.id, erased.withdrawalId));

      const mine = new Set(
        [old, exact, recent, restored, erased].map((customer) => customer.withdrawalId),
      );
      const due = (await readDueWithdrawals(tx, { before: BEFORE, limit: 1000 })).filter((row) =>
        mine.has(row.id),
      );
      expect(due).toEqual([
        {
          id: old.withdrawalId,
          userId: old.userId,
          accountType: 'customer',
          customerId: old.customerId,
          ownerId: null,
        },
        expect.objectContaining({ id: exact.withdrawalId }),
      ]);
      expect(await lockDueWithdrawal(tx, old.withdrawalId)).toEqual({
        email: `${old.userId}@test.invalid`,
      });
      expect(await lockDueWithdrawal(tx, restored.withdrawalId)).toBeNull();
      expect(await lockDueWithdrawal(tx, erased.withdrawalId)).toBeNull();
    });
  });

  it('고객: 이름·닉네임을 "탈퇴한 회원"으로, 휴대폰을 지우고 기록을 끝낸다', async () => {
    await withRollback(async (tx) => {
      const customer = await withdrawCustomer(tx, daysAgo(31));
      await eraseCustomerData(tx, {
        withdrawalId: customer.withdrawalId,
        customerId: customer.customerId,
        now: NOW,
      });
      const [row] = await tx.select().from(customers).where(eq(customers.id, customer.customerId));
      expect(row).toMatchObject({ name: ERASED_NAME, nickname: ERASED_NAME, phone: null });
      const [withdrawal] = await tx
        .select()
        .from(accountWithdrawals)
        .where(eq(accountWithdrawals.id, customer.withdrawalId));
      expect(withdrawal.erasedAt).toEqual(NOW);
      expect(await lockDueWithdrawal(tx, customer.withdrawalId)).toBeNull();
    });
  });

  it('원장님: 이름·휴대폰, 등록증, 샵 소개, 계좌번호·예금주, 메뉴 설명, 샵 사진을 지우고 상호·주소·은행·뒷자리·메뉴 이름은 남긴다', async () => {
    await withRollback(async (tx) => {
      const owner = await withdrawOwner(tx, daysAgo(31));
      await tx.insert(payoutAccounts).values({
        shopId: owner.shopId,
        bankCode: '088',
        accountNumberEncrypted: 'v1:iv:tag:cipher',
        accountLast4: '6789',
        accountHolder: '김원장',
      });
      await tx.update(menus).set({ description: '커트 설명' }).where(eq(menus.id, owner.menuId));
      await tx.insert(shopImages).values([
        {
          shopId: owner.shopId,
          kind: 'main',
          storagePath: `${owner.shopId}/main.jpg`,
          sortOrder: 0,
        },
        {
          shopId: owner.shopId,
          kind: 'style',
          storagePath: `${owner.shopId}/s1.jpg`,
          sortOrder: 1,
        },
      ]);
      const [shopBefore] = await tx.select().from(shops).where(eq(shops.id, owner.shopId));

      const files = await eraseOwnerData(tx, {
        withdrawalId: owner.withdrawalId,
        ownerId: owner.ownerId,
        now: NOW,
      });

      expect(files).toEqual({
        businessDocPaths: [shopBefore.businessDocPath],
        shopImagePaths: expect.arrayContaining([
          `${owner.shopId}/main.jpg`,
          `${owner.shopId}/s1.jpg`,
        ]),
      });
      const [ownerRow] = await tx.select().from(owners).where(eq(owners.id, owner.ownerId));
      expect(ownerRow).toMatchObject({ name: ERASED_NAME, phone: null });
      const [shopRow] = await tx.select().from(shops).where(eq(shops.id, owner.shopId));
      expect(shopRow).toMatchObject({
        status: 'withdrawn',
        businessDocPath: null,
        description: null,
        businessName: shopBefore.businessName,
        representativeName: shopBefore.representativeName,
        businessRegistrationNumber: shopBefore.businessRegistrationNumber,
        roadAddress: shopBefore.roadAddress,
      });
      const [payout] = await tx
        .select()
        .from(payoutAccounts)
        .where(eq(payoutAccounts.shopId, owner.shopId));
      expect(payout).toMatchObject({
        bankCode: '088',
        accountLast4: '6789',
        accountNumberEncrypted: null,
        accountHolder: null,
      });
      const [menu] = await tx.select().from(menus).where(eq(menus.id, owner.menuId));
      expect(menu).toMatchObject({ description: null, name: '커트' });
      expect(await tx.select().from(shopImages).where(eq(shopImages.shopId, owner.shopId))).toEqual(
        [],
      );
      const [withdrawal] = await tx
        .select()
        .from(accountWithdrawals)
        .where(eq(accountWithdrawals.id, owner.withdrawalId));
      expect(withdrawal.erasedAt).toEqual(NOW);
    });
  });

  it('로그인 정보는 계정이 모두 탈퇴했고 끝나지 않은 탈퇴 기록이 없는 사람만 지운다. 지우면 이메일만 비우고 같은 사람 표시는 남긴다', async () => {
    await withRollback(async (tx) => {
      const done = await withdrawCustomer(tx, daysAgo(40));
      await tx
        .update(accountWithdrawals)
        .set({ erasedAt: daysAgo(10) })
        .where(eq(accountWithdrawals.id, done.withdrawalId));
      await tx
        .update(profiles)
        .set({ identityHash: 'hash-done' })
        .where(eq(profiles.id, done.userId));
      // 고객 계정은 지웠지만 같은 로그인의 원장님 계정은 쓰는 중
      const ownerStillActive = await withdrawCustomer(tx, daysAgo(40));
      await tx
        .update(accountWithdrawals)
        .set({ erasedAt: daysAgo(10) })
        .where(eq(accountWithdrawals.id, ownerStillActive.withdrawalId));
      await tx
        .insert(owners)
        .values({ userId: ownerStillActive.userId, name: '김원장', phone: '010-0000-0000' });
      // 아직 30일이 안 됨
      const waiting = await withdrawCustomer(tx, daysAgo(3));
      // 운영자
      const admin = await withdrawCustomer(tx, daysAgo(40));
      await tx
        .update(accountWithdrawals)
        .set({ erasedAt: daysAgo(10) })
        .where(eq(accountWithdrawals.id, admin.withdrawalId));
      await tx.update(profiles).set({ isAdmin: true }).where(eq(profiles.id, admin.userId));
      // 탈퇴한 적 없는 사람
      const never = await createTestCustomer(tx);

      const mine = new Set(
        [done, ownerStillActive, waiting, admin, never].map((person) => person.userId),
      );
      const pick = async () =>
        (await readProfilesToForget(tx, { limit: 1000 }))
          .map((row) => row.userId)
          .filter((userId) => mine.has(userId));
      expect(await pick()).toEqual([done.userId]);

      await forgetProfileEmail(tx, done.userId);
      const [profile] = await tx.select().from(profiles).where(eq(profiles.id, done.userId));
      expect(profile).toMatchObject({ email: null, identityHash: 'hash-done' });
      // 이메일을 비운 사람은 다시 고르지 않는다
      expect(await pick()).toEqual([]);
    });
  });
});
