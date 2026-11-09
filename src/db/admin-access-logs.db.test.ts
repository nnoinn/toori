// 운영자 열람 기록(admin_access_logs, #269)은 DB 트리거가 고치기·지우기·비우기를 막는다(마이그레이션 0009, #286 리뷰).
// 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { eq, sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminAccessLogs } from '@/db/schema';

import { createTestUser } from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** savepoint 안에서 돌려 막혔으면 오류 문구, 통과했으면 null. 바깥 트랜잭션은 계속 쓸 수 있다 */
async function blockedMessage(tx: TestTx, run: (t: TestTx) => Promise<unknown>) {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
    return null;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    return String((cause as { message?: string }).message ?? cause);
  }
}

describeDb('운영자 열람 기록 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('넣기만 되고 고치기·지우기·비우기는 트리거가 막는다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const [row] = await tx
        .insert(adminAccessLogs)
        .values({ adminId, action: 'search', targetType: 'list', path: '/admin/users' })
        .returning({ id: adminAccessLogs.id });

      const blocked = '운영자 열람 기록은 고치거나 지울 수 없어요';
      expect(
        await blockedMessage(tx, (t) =>
          t.update(adminAccessLogs).set({ path: '/admin' }).where(eq(adminAccessLogs.id, row.id)),
        ),
      ).toContain(blocked);
      expect(
        await blockedMessage(tx, (t) =>
          t.delete(adminAccessLogs).where(eq(adminAccessLogs.id, row.id)),
        ),
      ).toContain(blocked);
      expect(
        await blockedMessage(tx, (t) => t.execute(sql`truncate table admin_access_logs`)),
      ).toContain(blocked);

      const [kept] = await tx
        .select({ path: adminAccessLogs.path })
        .from(adminAccessLogs)
        .where(eq(adminAccessLogs.id, row.id));
      expect(kept.path).toBe('/admin/users');
    });
  });
});
