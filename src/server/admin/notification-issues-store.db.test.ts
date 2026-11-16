// 운영자 알림 종(#373 ⑤)의 건수와 최근 알림을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 알림함 기간 안의 보내지 못함·기기 없음만, 두 종류를 합쳐 최신 순으로 고르는지 본다.

import { afterAll, expect, it } from 'vitest';

import type { getDb } from '@/db';
import { notifications } from '@/db/schema';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import {
  countNotificationIssues,
  selectRecentNotificationIssues,
} from './notification-issues-store';

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];
type Db = ReturnType<typeof getDb>;

/** 11/16 12:00(한국 시간) */
const NOW = new Date('2026-11-16T03:00:00.000Z');
const MINUTE = 60_000;

let seq = 0;

async function addNotification(
  tx: Tx,
  input: { userId: string; status: string; minutesAgo: number; title: string },
): Promise<string> {
  seq += 1;
  const [row] = await tx
    .insert(notifications)
    .values({
      userId: input.userId,
      accountType: 'customer',
      event: 'test.bell',
      channel: 'web_push',
      dedupeKey: `test:bell:${input.userId}:${seq}`,
      payload: { title: input.title, body: '내용', url: '/' },
      status: input.status,
      createdAt: new Date(NOW.getTime() - input.minutesAgo * MINUTE),
    })
    .returning({ id: notifications.id });
  return row.id;
}

describeDb('운영자 알림 종 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('알림함 기간 안의 보내지 못함·기기 없음을 합쳐 최신 순으로 고르고, 종류마다 센다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const userId = await createTestUser(tx);
      const failed = await addNotification(tx, {
        userId,
        status: 'failed',
        minutesAgo: 1,
        title: '예약이 확정됐어요',
      });
      const noDevice = await addNotification(tx, {
        userId,
        status: 'no_device',
        minutesAgo: 2,
        title: '예약 2시간 전이에요',
      });
      const sent = await addNotification(tx, {
        userId,
        status: 'sent',
        minutesAgo: 0,
        title: '보낸 알림',
      });
      const old = await addNotification(tx, {
        userId,
        status: 'failed',
        minutesAgo: 91 * 24 * 60,
        title: '오래된 알림',
      });

      const recent = await selectRecentNotificationIssues(db, { now: NOW, limit: 50 });
      const ids = recent.map((item) => item.notificationId);
      expect(ids.indexOf(failed)).toBeLessThan(ids.indexOf(noDevice));
      expect(ids).not.toContain(sent);
      expect(ids).not.toContain(old);
      expect(recent.find((item) => item.notificationId === failed)).toEqual({
        notificationId: failed,
        status: 'failed',
        title: '예약이 확정됐어요',
        createdAt: new Date(NOW.getTime() - MINUTE).toISOString(),
      });
      expect(await selectRecentNotificationIssues(db, { now: NOW, limit: 1 })).toHaveLength(1);

      const counts = await countNotificationIssues(db, NOW);
      expect(counts.failed).toBeGreaterThanOrEqual(1);
      expect(counts.no_device).toBeGreaterThanOrEqual(1);
    });
  });
});
