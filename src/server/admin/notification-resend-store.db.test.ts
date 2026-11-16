// 운영자 알림 다시 보내기(#373 ⑤)의 저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 보내지 못함·기기 없음만 한 번 자리를 잡고(두 운영자가 동시에 눌러도 한 번만 보낸다), 못 받으면 failed로 남는지 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import type { getDb } from '@/db';
import { notifications } from '@/db/schema';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import {
  claimNotificationResend,
  markResendFailed,
  readResendNotification,
} from './notification-resend-store';

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];
type Db = ReturnType<typeof getDb>;

let seq = 0;

async function addNotification(tx: Tx, userId: string, status: string): Promise<string> {
  seq += 1;
  const [row] = await tx
    .insert(notifications)
    .values({
      userId,
      accountType: 'customer',
      event: 'test.resend',
      channel: 'web_push',
      dedupeKey: `test:resend:${userId}:${seq}`,
      payload: { title: '예약이 확정됐어요', body: '내용', url: '/reservations' },
      status,
      error: status === 'failed' ? 'failed' : null,
    })
    .returning({ id: notifications.id });
  return row.id;
}

describeDb('알림 다시 보내기 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('보내지 못함·기기 없음인 알림만 한 번 자리를 잡고(sent, 이유 지움), 이미 보낸 알림은 잡지 않는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const userId = await createTestUser(tx);
      const failed = await addNotification(tx, userId, 'failed');
      const noDevice = await addNotification(tx, userId, 'no_device');
      const sent = await addNotification(tx, userId, 'sent');

      expect(await claimNotificationResend(db, failed)).toBe(true);
      expect(await claimNotificationResend(db, failed)).toBe(false);
      expect(await claimNotificationResend(db, noDevice)).toBe(true);
      expect(await claimNotificationResend(db, sent)).toBe(false);
      expect(await readResendNotification(db, failed)).toMatchObject({
        status: 'sent',
        userId,
        accountType: 'customer',
        payload: { title: '예약이 확정됐어요' },
      });
      const [row] = await tx
        .select({ error: notifications.error })
        .from(notifications)
        .where(eq(notifications.id, failed));
      expect(row.error).toBeNull();
    });
  });

  it('한 기기도 받지 못하면 failed와 기기마다 결과를 남기고, 없는 알림은 null이다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const userId = await createTestUser(tx);
      const id = await addNotification(tx, userId, 'no_device');
      await claimNotificationResend(db, id);
      await markResendFailed(db, id, 'expired,failed');
      expect(await readResendNotification(db, id)).toMatchObject({ status: 'failed' });
      const [row] = await tx
        .select({ error: notifications.error })
        .from(notifications)
        .where(eq(notifications.id, id));
      expect(row.error).toBe('expired,failed');
      expect(await readResendNotification(db, crypto.randomUUID())).toBeNull();
    });
  });
});
