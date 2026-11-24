// 2년마다 광고성 정보 수신 동의 확인(#535)의 동의 읽기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 테스트 DB에는 다른 동의도 있을 수 있어서, 이 테스트가 만든 사람의 동의만 보고 맞춘다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers, notifications, termsAgreements } from '@/db/schema';

import { createTestCustomer, createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readRecheckAgreements, readSentDedupeKeys } from './consent-recheck-store';

const kst = (text: string) => new Date(`${text}+09:00`);
/** 이 시각 전에 동의한 것만 읽는다 */
const BEFORE = kst('2024-11-27T13:00:00');
const OLD = kst('2024-11-23T15:00:00');

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];
type Reader = Parameters<typeof readRecheckAgreements>[0];

async function agree(
  tx: Tx,
  input: {
    userId: string;
    termsType: string;
    agreedAt?: Date;
    accountType?: string;
    withdrawnAt?: Date;
  },
): Promise<string> {
  const [row] = await tx
    .insert(termsAgreements)
    .values({
      userId: input.userId,
      accountType: input.accountType ?? 'customer',
      termsType: input.termsType,
      version: 'test',
      agreedAt: input.agreedAt ?? OLD,
      withdrawnAt: input.withdrawnAt ?? null,
    })
    .returning({ id: termsAgreements.id });
  return row.id;
}

describeDb('수신 동의 확인 대상 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('켜져 있는 고객의 이벤트·혜택 소식과 새 매물 알림 동의 중 기준 전에 동의한 것만 읽는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Reader;
      const customer = await createTestCustomer(tx);
      const marketing = await agree(tx, { userId: customer.userId, termsType: 'marketing' });
      const interest = await agree(tx, {
        userId: customer.userId,
        termsType: 'interest_alert',
        agreedAt: kst('2024-11-20T09:00:00'),
      });
      // 필수 동의와 위치 동의는 확인 대상이 아니다
      const service = await agree(tx, { userId: customer.userId, termsType: 'service' });
      // 기준 뒤 동의(아직 2년이 안 됨)
      const recent = await createTestCustomer(tx);
      const tooNew = await agree(tx, {
        userId: recent.userId,
        termsType: 'marketing',
        agreedAt: kst('2025-06-01T09:00:00'),
      });
      // 철회한 동의(다시 동의하면 새 줄이라 그 줄의 날짜부터 다시 센다)
      const changed = await createTestCustomer(tx);
      const withdrawn = await agree(tx, {
        userId: changed.userId,
        termsType: 'marketing',
        withdrawnAt: kst('2025-01-10T09:00:00'),
      });
      const again = await agree(tx, {
        userId: changed.userId,
        termsType: 'marketing',
        agreedAt: kst('2024-11-25T09:00:00'),
      });
      // 탈퇴한 고객 계정
      const left = await createTestCustomer(tx);
      const leftAgreement = await agree(tx, { userId: left.userId, termsType: 'marketing' });
      await tx
        .update(customers)
        .set({ withdrawnAt: kst('2025-03-01T09:00:00') })
        .where(eq(customers.id, left.customerId));
      // 원장님 계정 쪽 동의(고객 계정은 있어도)
      const ownerSide = await agree(tx, {
        userId: customer.userId,
        termsType: 'marketing',
        accountType: 'owner',
      });
      // 고객 계정이 없는 사람
      const noCustomer = await createTestUser(tx);
      const orphan = await agree(tx, { userId: noCustomer, termsType: 'marketing' });

      const mine = new Set([
        marketing,
        interest,
        service,
        tooNew,
        withdrawn,
        again,
        leftAgreement,
        ownerSide,
        orphan,
      ]);
      const rows = (await readRecheckAgreements(db, { agreedBefore: BEFORE })).filter((row) =>
        mine.has(row.agreementId),
      );

      expect(rows).toEqual([
        {
          agreementId: interest,
          userId: customer.userId,
          termsType: 'interest_alert',
          agreedAt: kst('2024-11-20T09:00:00'),
        },
        { agreementId: marketing, userId: customer.userId, termsType: 'marketing', agreedAt: OLD },
        {
          agreementId: again,
          userId: changed.userId,
          termsType: 'marketing',
          agreedAt: kst('2024-11-25T09:00:00'),
        },
      ]);
    });
  });

  it('이미 보낸 알림의 dedupe_key만 돌려준다. 빈 목록이면 DB를 읽지 않는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Reader;
      const customer = await createTestCustomer(tx);
      const sentKey = `consent.recheck:${crypto.randomUUID()}:1`;
      const otherKey = `consent.recheck:${crypto.randomUUID()}:1`;
      await tx.insert(notifications).values({
        userId: customer.userId,
        accountType: 'customer',
        event: 'consent.recheck',
        channel: 'web_push',
        dedupeKey: sentKey,
        payload: { title: '확인', body: '내용', url: '/me' },
        status: 'no_device',
      });

      expect(await readSentDedupeKeys(db, [sentKey, otherKey])).toEqual(new Set([sentKey]));
      expect(await readSentDedupeKeys({} as Reader, [])).toEqual(new Set());
    });
  });
});
