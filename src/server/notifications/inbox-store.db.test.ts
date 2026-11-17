// 알림함 읽기·저장을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다(#371, NOTI-05·NOTI-07).
// 그 계정(고객/원장님)의 최근 90일 알림만 보이는지, 같은 시각 알림이 쪽을 넘겨도 빠지지 않는지, 읽음·정리가 그 범위만 바꾸는지 본다.

import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import type { getDb } from '@/db';
import { notifications } from '@/db/schema';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import {
  countUnreadInbox,
  deleteExpiredNotifications,
  type InboxOwner,
  inboxStart,
  markInboxRead,
  selectInboxPage,
  selectInboxSince,
} from './inbox-store';

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];
type Db = ReturnType<typeof getDb>;

/** 11/16 12:00(한국 시간) */
const NOW = new Date('2026-11-16T03:00:00.000Z');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

let seq = 0;

/** 알림 한 줄을 넣고 id를 돌려준다 */
async function addNotification(
  tx: Tx,
  input: {
    userId: string;
    accountType?: 'customer' | 'owner';
    createdAt: Date;
    readAt?: Date | null;
  },
): Promise<string> {
  seq += 1;
  const [row] = await tx
    .insert(notifications)
    .values({
      userId: input.userId,
      accountType: input.accountType ?? 'customer',
      event: 'test.inbox',
      channel: 'web_push',
      dedupeKey: `test:inbox:${input.userId}:${seq}`,
      payload: { title: `알림 ${seq}`, body: '내용', url: '/reservations' },
      status: 'no_device',
      readAt: input.readAt ?? null,
      createdAt: input.createdAt,
    })
    .returning({ id: notifications.id });
  return row.id;
}

function inboxOf(userId: string, accountType: 'customer' | 'owner' = 'customer'): InboxOwner {
  return { userId, accountType, from: inboxStart(NOW) };
}

describeDb('알림함 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('알림함은 그 계정(고객/원장님)의 최근 90일 알림만 최신 순으로 보여 주고, 같은 시각 알림도 빠지지 않고 다음 쪽으로 이어진다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const me = await createTestUser(tx);
      const other = await createTestUser(tx);
      const sameTime = ago(60 * MINUTE);
      const tied = [
        await addNotification(tx, { userId: me, createdAt: sameTime }),
        await addNotification(tx, { userId: me, createdAt: sameTime }),
        await addNotification(tx, { userId: me, createdAt: sameTime }),
      ];
      const older = await addNotification(tx, { userId: me, createdAt: ago(120 * MINUTE) });
      const expired = await addNotification(tx, { userId: me, createdAt: ago(91 * DAY) });
      const ownerSide = await addNotification(tx, {
        userId: me,
        accountType: 'owner',
        createdAt: ago(30 * MINUTE),
      });
      const someoneElse = await addNotification(tx, { userId: other, createdAt: ago(10 * MINUTE) });

      const seen: string[] = [];
      let afterId: string | null = null;
      for (let page = 0; page < 5; page += 1) {
        const items = await selectInboxPage(db, inboxOf(me), { afterId, limit: 2 });
        if (items.length === 0) break;
        seen.push(...items.map((item) => item.id));
        afterId = items.at(-1)?.id ?? null;
      }
      // 같은 시각 셋이 먼저(id 큰 순), 그다음 더 오래된 것. 90일 지난 것·원장님 알림·다른 사람 알림은 없다
      expect(seen).toEqual([...[...tied].sort().reverse(), older]);
      expect(seen).not.toContain(expired);

      const ownerItems = await selectInboxPage(db, inboxOf(me, 'owner'), {
        afterId: null,
        limit: 20,
      });
      expect(ownerItems.map((item) => item.id)).toEqual([ownerSide]);
      expect(ownerItems[0]).toMatchObject({ body: '내용', url: '/reservations', readAt: null });

      // 다른 사람 알림을 다음 쪽 기준으로 넘기면 빈 쪽이다
      expect(await selectInboxPage(db, inboxOf(me), { afterId: someoneElse, limit: 20 })).toEqual(
        [],
      );
    });
  });

  it('안 읽은 수와 읽음은 그 계정의 최근 90일 알림만 세고 바꾼다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const me = await createTestUser(tx);
      const other = await createTestUser(tx);
      const unreadA = await addNotification(tx, { userId: me, createdAt: ago(5 * MINUTE) });
      await addNotification(tx, { userId: me, createdAt: ago(6 * MINUTE) });
      await addNotification(tx, { userId: me, createdAt: ago(7 * MINUTE), readAt: ago(MINUTE) });
      await addNotification(tx, { userId: me, createdAt: ago(91 * DAY) });
      const ownerUnread = await addNotification(tx, {
        userId: me,
        accountType: 'owner',
        createdAt: ago(5 * MINUTE),
      });
      const otherUnread = await addNotification(tx, { userId: other, createdAt: ago(5 * MINUTE) });

      expect(await countUnreadInbox(db, inboxOf(me))).toBe(2);
      // 다른 계정·다른 사람의 id는 건너뛴다
      expect(
        await markInboxRead(db, inboxOf(me), { ids: [unreadA, ownerUnread, otherUnread] }, NOW),
      ).toBe(1);
      expect(await countUnreadInbox(db, inboxOf(me))).toBe(1);
      expect(await markInboxRead(db, inboxOf(me), { all: true }, NOW)).toBe(1);
      expect(await countUnreadInbox(db, inboxOf(me))).toBe(0);

      const untouched = await tx
        .select({ id: notifications.id, readAt: notifications.readAt })
        .from(notifications)
        .where(inArray(notifications.id, [ownerUnread, otherUnread]));
      expect(untouched.map((row) => row.readAt)).toEqual([null, null]);
      const [marked] = await tx
        .select({ readAt: notifications.readAt })
        .from(notifications)
        .where(eq(notifications.id, unreadA));
      expect(marked.readAt).toEqual(NOW);
    });
  });

  it('화면 안내용은 after 뒤에 생긴 그 계정 알림 중 최신 limit개를 오래된 순으로 준다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const me = await createTestUser(tx);
      await addNotification(tx, { userId: me, createdAt: ago(3 * MINUTE) });
      const second = await addNotification(tx, { userId: me, createdAt: ago(2 * MINUTE) });
      const third = await addNotification(tx, { userId: me, createdAt: ago(MINUTE) });
      await addNotification(tx, { userId: me, accountType: 'owner', createdAt: ago(MINUTE) });

      const after = ago(150_000);
      const all = await selectInboxSince(db, inboxOf(me), { after, limit: 20 });
      expect(all.map((item) => item.id)).toEqual([second, third]);
      const newest = await selectInboxSince(db, inboxOf(me), { after, limit: 1 });
      expect(newest.map((item) => item.id)).toEqual([third]);
    });
  });

  it('알림함 기간(90일)이 지난 알림만 지운다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const me = await createTestUser(tx);
      const expired = await addNotification(tx, { userId: me, createdAt: ago(91 * DAY) });
      const kept = await addNotification(tx, { userId: me, createdAt: ago(89 * DAY) });

      expect(await deleteExpiredNotifications(db, inboxStart(NOW))).toBeGreaterThanOrEqual(1);
      const left = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(inArray(notifications.id, [expired, kept]));
      expect(left.map((row) => row.id)).toEqual([kept]);
    });
  });
});
