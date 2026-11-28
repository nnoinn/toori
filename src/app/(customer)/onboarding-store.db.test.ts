// 첫 로그인 안내(C-107)를 봤는지 남기고 읽는 것을 실제 DB로 본다.
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers } from '@/db/schema';

import { createTestCustomer } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { markOnboardingSeen, selectOnboardingSeen } from './onboarding-store';

afterAll(closeTestDb);

describeDb('첫 로그인 안내 본 시각 (C-107)', () => {
  it('새 고객 계정은 아직 안 봤고, 남기면 본 것이 되고, 다른 고객은 그대로다', async () => {
    await withRollback(async (tx) => {
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      expect(await selectOnboardingSeen(tx, me.customerId)).toBe(false);
      await markOnboardingSeen(tx, me.customerId);
      expect(await selectOnboardingSeen(tx, me.customerId)).toBe(true);
      expect(await selectOnboardingSeen(tx, other.customerId)).toBe(false);
    });
  });

  it('다시 남겨도 처음 본 시각을 그대로 둔다', async () => {
    await withRollback(async (tx) => {
      const me = await createTestCustomer(tx);
      const first = new Date('2026-11-01T10:00:00+09:00');
      await tx
        .update(customers)
        .set({ onboardingSeenAt: first })
        .where(eq(customers.id, me.customerId));

      await markOnboardingSeen(tx, me.customerId);
      const [row] = await tx
        .select({ seenAt: customers.onboardingSeenAt })
        .from(customers)
        .where(eq(customers.id, me.customerId));
      expect(row.seenAt?.toISOString()).toBe(first.toISOString());
    });
  });

  it('없는 계정이면 본 것으로 본다(안내를 띄우지 않는다)', async () => {
    await withRollback(async (tx) => {
      expect(await selectOnboardingSeen(tx, '00000000-0000-4000-8000-000000000000')).toBe(true);
    });
  });
});
