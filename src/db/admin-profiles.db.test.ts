// 운영자 프로필(admin_profiles)과 운영자 작업 기록(admin_actions) 지키기 (마이그레이션 0016, #372 4·5장).
// 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 작업 기록은 열람 기록(0009)처럼 넣기만 되고 고치기·지우기·비우기를 트리거가 막는다(AUTH-10)
// - 프로필은 이름을 고칠 수 있지만 지울 수 없다(그만둔 운영자도 기록 화면에 이름이 보여야 한다)

import { eq, sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminActions, adminProfiles } from '@/db/schema';

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

describeDb('운영자 프로필과 작업 기록 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('작업 기록은 넣기만 되고 고치기·지우기·비우기는 트리거가 막는다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const [row] = await tx
        .insert(adminActions)
        .values({
          adminId,
          action: 'shop.approve',
          targetType: 'shop',
          targetId: crypto.randomUUID(),
          memo: '서류 확인',
        })
        .returning({ id: adminActions.id });

      const blocked = '운영자 작업 기록은 고치거나 지울 수 없어요';
      expect(
        await blockedMessage(tx, (t) =>
          t.update(adminActions).set({ memo: '고친 사유' }).where(eq(adminActions.id, row.id)),
        ),
      ).toContain(blocked);
      expect(
        await blockedMessage(tx, (t) => t.delete(adminActions).where(eq(adminActions.id, row.id))),
      ).toContain(blocked);
      expect(
        await blockedMessage(tx, (t) => t.execute(sql`truncate table admin_actions`)),
      ).toContain(blocked);

      const [kept] = await tx
        .select({ memo: adminActions.memo })
        .from(adminActions)
        .where(eq(adminActions.id, row.id));
      expect(kept.memo).toBe('서류 확인');
    });
  });

  it('프로필은 이름(필수)·맡은 일을 넣고 고칠 수 있지만 지우기·비우기는 트리거가 막는다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      expect(
        await blockedMessage(tx, (t) =>
          t.execute(sql`insert into admin_profiles (user_id) values (${userId})`),
        ),
      ).toContain('null');

      await tx.insert(adminProfiles).values({ userId, name: '운영자 가', role: '정산' });
      await tx
        .update(adminProfiles)
        .set({ name: '운영자 나' })
        .where(eq(adminProfiles.userId, userId));

      const blocked = '운영자 프로필은 지울 수 없어요';
      expect(
        await blockedMessage(tx, (t) =>
          t.delete(adminProfiles).where(eq(adminProfiles.userId, userId)),
        ),
      ).toContain(blocked);
      expect(
        await blockedMessage(tx, (t) => t.execute(sql`truncate table admin_profiles`)),
      ).toContain(blocked);

      const [kept] = await tx
        .select({ name: adminProfiles.name, role: adminProfiles.role })
        .from(adminProfiles)
        .where(eq(adminProfiles.userId, userId));
      expect(kept).toEqual({ name: '운영자 나', role: '정산' });
    });
  });
});
