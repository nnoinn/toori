// 고객 가입·약관 동의 기록 저장 (#47 4·5장, #267). 선택 동의 상태 계산은 DB 없이,
// 실제 저장 모양과 약관 종류 제약(age14 0004, interest_alert 0008)은 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { asc, eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { customers, termsAgreements } from '@/db/schema';

import { createTestCustomer, createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import {
  isOptionalTerms,
  readMarketingConsent,
  readOptionalConsents,
  saveCustomerAccount,
  toOptionalConsent,
  writeMarketingConsent,
  writeOptionalConsent,
} from './account-store';

const at = (iso: string) => new Date(iso);
const PHONE = '010-1234-5678';

describe('isOptionalTerms', () => {
  it('선택 동의 두 종류만 true', () => {
    expect(isOptionalTerms('interest_alert')).toBe(true);
    expect(isOptionalTerms('marketing')).toBe(true);
    expect(isOptionalTerms('service')).toBe(false);
    expect(isOptionalTerms('')).toBe(false);
  });
});

describe('toOptionalConsent', () => {
  it('기록이 없으면 동의한 적 없음', () => {
    expect(toOptionalConsent([])).toEqual({ agreed: false, agreedAt: null, withdrawnAt: null });
  });

  it('철회하지 않은 기록이 있으면 동의한 상태이고 가장 최근 동의 시각을 쓴다', () => {
    expect(
      toOptionalConsent([
        { agreedAt: at('2026-10-01T00:00:00Z'), withdrawnAt: at('2026-10-05T00:00:00Z') },
        { agreedAt: at('2026-10-20T00:00:00Z'), withdrawnAt: null },
      ]),
    ).toEqual({ agreed: true, agreedAt: at('2026-10-20T00:00:00Z'), withdrawnAt: null });
  });

  it('모두 철회했으면 가장 최근 철회 시각을 쓴다', () => {
    expect(
      toOptionalConsent([
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

  it('고객 계정과 필수 동의(만 14세 확인 포함)를 저장한다. 선택 동의는 고른 때만', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const saved = await saveCustomerAccount(tx, {
        userId,
        name: '김투리',
        nickname: '김투리',
        phone: PHONE,
        optionalTerms: [],
      });

      const [customer] = await tx.select().from(customers).where(eq(customers.userId, userId));
      expect(saved).toEqual({ customerId: customer.id, consentNotices: [] });
      expect(customer).toMatchObject({ name: '김투리', nickname: '김투리', phone: PHONE });
      expect(await termsOf(tx, userId)).toEqual(
        ['age14', 'location', 'privacy', 'service'].map((termsType) => ({
          accountType: 'customer',
          termsType,
          // 개인정보 동의는 수집 항목에 이름을 더해 버전을 올렸다(동의 문구 1-1, #375)
          version: termsType === 'privacy' ? 'draft-2026-11' : 'draft-2026-10',
          withdrawnAt: null,
        })),
      );
    });
  });

  it('선택 동의를 고르면 그 기록도 남기고 동의마다 시각을 돌려준다(관심 동네·찜한 샵 알림이 먼저)', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const saved = await saveCustomerAccount(tx, {
        userId,
        name: '김투리',
        nickname: '김투리',
        phone: PHONE,
        optionalTerms: ['marketing', 'interest_alert'],
      });
      const terms = await termsOf(tx, userId);
      expect(terms.find((row) => row.termsType === 'interest_alert')).toMatchObject({
        version: 'draft-2026-11',
      });
      const consents = await readOptionalConsents(tx, userId, 'customer');
      expect(consents.marketing).toMatchObject({ agreed: true });
      expect(saved?.consentNotices).toEqual([
        { type: 'interest_alert', agreedAt: consents.interest_alert.agreedAt },
        { type: 'marketing', agreedAt: consents.marketing.agreedAt },
      ]);
    });
  });

  it('관심 동네·찜한 샵 알림만 고르면 광고성(marketing) 기록은 남기지 않는다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      await saveCustomerAccount(tx, {
        userId,
        name: '김투리',
        nickname: '김투리',
        phone: PHONE,
        optionalTerms: ['interest_alert'],
      });
      expect(await readOptionalConsents(tx, userId, 'customer')).toMatchObject({
        interest_alert: { agreed: true },
        marketing: { agreed: false, agreedAt: null, withdrawnAt: null },
      });
    });
  });

  it('이미 고객 계정이 있으면 null이고 동의 기록을 더 남기지 않고 번호도 바꾸지 않는다', async () => {
    await withRollback(async (tx) => {
      const { userId } = await createTestCustomer(tx);
      const before = await termsOf(tx, userId);
      expect(
        await saveCustomerAccount(tx, {
          userId,
          name: '다시',
          nickname: '다시',
          phone: PHONE,
          optionalTerms: ['marketing'],
        }),
      ).toBeNull();
      expect(await termsOf(tx, userId)).toEqual(before);
      const [customer] = await tx.select().from(customers).where(eq(customers.userId, userId));
      expect(customer.phone).toBeNull();
    });
  });

  it('다른 고객과 같은 번호여도 저장한다', async () => {
    await withRollback(async (tx) => {
      for (const nickname of ['첫째', '둘째']) {
        const userId = await createTestUser(tx);
        const saved = await saveCustomerAccount(tx, {
          userId,
          name: nickname,
          nickname,
          phone: PHONE,
          optionalTerms: [],
        });
        expect(saved).not.toBeNull();
      }
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

  it('두 선택 동의는 따로 켜고 끈다', async () => {
    await withRollback(async (tx) => {
      const { userId } = await createTestCustomer(tx);
      await writeOptionalConsent(tx, userId, 'customer', 'interest_alert', true);
      await writeMarketingConsent(tx, userId, 'customer', true);
      await writeOptionalConsent(tx, userId, 'customer', 'marketing', false);
      const consents = await readOptionalConsents(tx, userId, 'customer');
      expect(consents.interest_alert).toMatchObject({ agreed: true, withdrawnAt: null });
      expect(consents.marketing.agreed).toBe(false);
      expect(consents.marketing.withdrawnAt).toBeInstanceOf(Date);
    });
  });
});
