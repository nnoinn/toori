// 알림함 칸(마이그레이션 0017, #371)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 푸시 알림을 켠 기기가 없어도 알림을 남길 수 있게 status에 no_device가 들어간다(NOTI-05)
// - read_at은 비어 있으면 안 읽음이고, 읽은 시각을 적을 수 있다
// - 정해 둔 값이 아닌 status는 DB가 막는다

import { DrizzleQueryError, eq, sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { notifications } from '@/db/schema';

import { createTestUser } from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** savepoint 안에서 돌려 실패한 DB 오류를 돌려준다. 성공하면 undefined */
async function failure(tx: TestTx, run: (t: TestTx) => Promise<unknown>): Promise<unknown> {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
  } catch (error) {
    return error instanceof DrizzleQueryError ? error.cause : error;
  }
  return undefined;
}

const notice = (userId: string, status: string) => ({
  userId,
  accountType: 'customer',
  event: 'reservation.confirmed',
  channel: 'web_push',
  dedupeKey: `reservation.confirmed:customer:${crypto.randomUUID()}`,
  payload: { title: '예약이 확정됐어요', body: '샘플 헤어 11/20 14:00', url: '/reservations' },
  status,
});

describeDb('알림함 칸 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('기기가 없어도(no_device) 알림을 남기고, 처음에는 안 읽음(read_at 비어 있음)이다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const [row] = await tx.insert(notifications).values(notice(userId, 'no_device')).returning();
      expect(row).toMatchObject({ status: 'no_device', readAt: null });

      const readAt = new Date('2026-11-16T03:00:00Z');
      await tx.update(notifications).set({ readAt }).where(eq(notifications.id, row.id));
      const [read] = await tx.select().from(notifications).where(eq(notifications.id, row.id));
      expect(read.readAt).toEqual(readAt);
    });
  });

  it('정해 둔 값이 아닌 status는 DB가 막는다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      expect(
        await failure(tx, (t) => t.insert(notifications).values(notice(userId, 'queued'))),
      ).toMatchObject({ code: '23514', constraint_name: 'notifications_status_check' });
    });
  });

  it('알림함 인덱스가 있다(받는 사람·계정 종류·최근 순)', async () => {
    await withRollback(async (tx) => {
      const rows = await tx.execute<{ indexdef: string }>(
        sql`select indexdef from pg_indexes where indexname = 'notifications_inbox_idx'`,
      );
      expect([...rows].map((row) => row.indexdef)).toEqual([
        expect.stringContaining('(user_id, account_type, created_at, id)'),
      ]);
    });
  });
});
