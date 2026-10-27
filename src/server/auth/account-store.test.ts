// 고객 가입·약관 동의 기록 저장 (#47 4·5장). 광고성 동의 상태 계산은 DB 없이,
// 실제 저장 모양과 약관 종류 제약(age14, 마이그레이션 0004)은 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { customers, termsAgreements } from '@/db/schema';

import { createTestCustomer, createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  readMarketingConsent,
  saveCustomerAccount,
  toMarketingConsent,
  writeMarketingConsent,
} from './account-store';

const at = (iso: string) => new Date(iso);

describe('toMarketingConsent', () => {
  it('기록이 없으면 동의한 적 없음', () => {
    expect(toMarketingConsent([])).toEqual({ agreed: false, agreedAt: null, withdrawnAt: null });
  });

  it('철회하지 않은 기록이 있으면 동의한 상태이고 가장 최근 동의 시각을 쓴다', () => {
    expect(
      toMarketingConsent([
        { agreedAt: at('2026-10-01T00:00:00Z'), withdrawnAt: at('2026-10-05T00:00:00Z') },
        { agreedAt: at('2026-10-20T00:00:00Z'), withdrawnAt: null },
      ]),
    ).toEqual({ agreed: true, agreedAt: at('2026-10-20T00:00:00Z'), withdrawnAt: null });
  });

  it('모두 철회했으면 가장 최근 철회 시각을 쓴다', () => {
    expect(
      toMarketingConsent([
        { agreedAt: at('2026-10-10T00:00:00Z'), withdrawnAt: at('2026-10-12T00:00:00Z') },
        { agreedAt: at('2026-10-01T00:00:00Z'), withdrawnAt: at('2026-10-03T00:00:00Z') },
      ]),
    ).toEqual({ agreed: false, agreedAt: null, withdrawnAt: at('2026-10-12T00:00:00Z') });
  });
});

const termsOf = (tx: TestTx, userId: string) =>
  tx
    .select({
      accountType: termsAgreements.accountType,
      termsType: termsAgreements.termsType,
      version: termsAgreements.version,
      withdrawnAt: termsAgreements.withdrawnAt,
    })
    .from(termsAgreements)
    .where(eq(termsAgreements.userId, userId))
    .orderBy(asc(termsAgreements.termsType));

describeDb('계정·약관 동의 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('고객 계정과 필수 동의(만 14세 확인 포함)를 저장한다. 광고성 동의는 고른 때만', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const customerId = await saveCustomerAccount(tx, {
        userId,
        nickname: '김투리',
        marketing: false,
      });

      const [customer] = await tx.select().from(customers).where(eq(customers.userId, userId));
      expect(customer).toMatchObject({ id: customerId, nickname: '김투리' });
      expect(await termsOf(tx, userId)).toEqual(
        ['age14', 'location', 'privacy', 'service'].map((termsType) => ({
          accountType: 'customer',
          termsType,
          version: 'draft-2026-10',
          withdrawnAt: null,
        })),
      );
    });
  });

  it('광고성 정보 수신에 동의하면 marketing 기록도 남긴다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      await saveCustomerAccount(tx, { userId, nickname: '김투리', marketing: true });
      expect((await termsOf(tx, userId)).map((row) => row.termsType)).toContain('marketing');
      expect(await readMarketingConsent(tx, userId, 'customer')).toMatchObject({ agreed: true });
    });
  });

  it('이미 고객 계정이 있으면 null이고 동의 기록을 더 남기지 않는다', async () => {
    await withRollback(async (tx) => {
      const { userId } = await createTestCustomer(tx);
      const before = await termsOf(tx, userId);
      expect(
        await saveCustomerAccount(tx, { userId, nickname: '다시', marketing: true }),
      ).toBeNull();
      expect(await termsOf(tx, userId)).toEqual(before);
    });
  });

  it('광고성 동의를 켜고 끄고 다시 켜면 기록을 지우지 않고 쌓는다', async () => {
    await withRollback(async (tx) => {
      const { userId } = await createTestCustomer(tx);

      const on = await writeMarketingConsent(tx, userId, 'customer', true);
      expect(on).toMatchObject({ agreed: true, withdrawnAt: null });
      expect(on.agreedAt).toBeInstanceOf(Date);
      // 이미 켜져 있으면 그대로(기록을 더하지 않는다)
      expect(await writeMarketingConsent(tx, userId, 'customer', true)).toEqual(on);

      const off = await writeMarketingConsent(tx, userId, 'customer', false);
      expect(off).toMatchObject({ agreed: false, agreedAt: null });
      expect(off.withdrawnAt).toBeInstanceOf(Date);

      await writeMarketingConsent(tx, userId, 'customer', true);
      const marketing = (await termsOf(tx, userId)).filter((r) => r.termsType === 'marketing');
      expect(marketing.map((r) => r.withdrawnAt === null).sort()).toEqual([false, true]);
    });
  });

  it('고객 계정의 광고성 동의는 원장님 계정과 따로 본다', async () => {
    await withRollback(async (tx) => {
      const { userId } = await createTestCustomer(tx);
      await writeMarketingConsent(tx, userId, 'customer', true);
      expect(await readMarketingConsent(tx, userId, 'owner')).toMatchObject({ agreed: false });
    });
  });
});
