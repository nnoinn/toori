// 알림 기록을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 같은 dedupe_key로 두 번 불러도 한 번만 보낸다. 푸시만 가짜로 바꾼다.

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

import { notifications, pushSubscriptions } from '@/db/schema';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';

const state = vi.hoisted(() => ({ result: 'sent', sent: 0 }));

vi.mock('./send-web-push', () => ({
  sendWebPush: async () => {
    state.sent += 1;
    return state.result;
  },
}));

const { notify } = await import('./notify');

beforeEach(() => {
  state.result = 'sent';
  state.sent = 0;
});

describeDb('알림 기록 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('같은 dedupe_key로 두 번 불러도 한 번만 보내고 한 줄만 남는다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      await tx.insert(pushSubscriptions).values({
        userId,
        accountType: 'customer',
        endpoint: 'https://push.example/notify-1',
        p256dh: 'p',
        auth: 'a',
      });
      const input = {
        userId,
        accountType: 'customer' as const,
        event: 'reservation.confirmed',
        dedupeKey: `test:${userId}`,
        title: '제목',
        body: '내용',
        url: '/reservations/r-1',
      };
      const db = tx as unknown as Parameters<typeof notify>[0];
      await notify(db, input);
      await notify(db, input);
      expect(state.sent).toBe(1);
      const rows = await tx
        .select()
        .from(notifications)
        .where(eq(notifications.dedupeKey, input.dedupeKey));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'sent', channel: 'web_push', error: null });
    });
  });

  it('구독이 끝났으면 지우고 failed로 남긴다', async () => {
    await withRollback(async (tx) => {
      const userId = await createTestUser(tx);
      const endpoint = 'https://push.example/notify-2';
      await tx
        .insert(pushSubscriptions)
        .values({ userId, accountType: 'customer', endpoint, p256dh: 'p', auth: 'a' });
      state.result = 'expired';
      const dedupeKey = `test:${userId}`;
      await notify(tx as unknown as Parameters<typeof notify>[0], {
        userId,
        accountType: 'customer',
        event: 'reservation.confirmed',
        dedupeKey,
        title: '제목',
        body: '내용',
        url: '/',
      });
      expect(
        await tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)),
      ).toEqual([]);
      const [row] = await tx
        .select()
        .from(notifications)
        .where(eq(notifications.dedupeKey, dedupeKey));
      expect(row).toMatchObject({ status: 'failed', error: 'expired' });
    });
  });
});
