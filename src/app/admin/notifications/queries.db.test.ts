// 운영자 알림 확인 화면(#373 ⑤)의 조회를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 알림함 기간 안의 보내지 못함·기기 없음만, 최신 순, 받는 계정 이름(고객 이름·샵 이름)과 지금 기기 수를 읽는지 본다.

import { afterAll, expect, it } from 'vitest';

import type { getDb } from '@/db';
import { notifications, pushSubscriptions } from '@/db/schema';

import { createTestCustomer, createTestShop } from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import { countNotificationIssues, selectNotificationIssues } from './queries';

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];
type Db = ReturnType<typeof getDb>;

/** 11/16 12:00(한국 시간) */
const NOW = new Date('2026-11-16T03:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;

async function addNotification(
  tx: Tx,
  input: {
    userId: string;
    accountType: 'customer' | 'owner';
    status: string;
    createdAt: Date;
    title: string;
  },
): Promise<string> {
  seq += 1;
  const [row] = await tx
    .insert(notifications)
    .values({
      userId: input.userId,
      accountType: input.accountType,
      event: 'test.issue',
      channel: 'web_push',
      dedupeKey: `test:issue:${input.userId}:${seq}`,
      payload: { title: input.title, body: '내용', url: '/' },
      status: input.status,
      error: input.status === 'failed' ? 'expired' : null,
      createdAt: input.createdAt,
    })
    .returning({ id: notifications.id });
  return row.id;
}

describeDb('운영자 알림 확인 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('알림함 기간 안의 보내지 못함·기기 없음만 종류마다 세고, 최신 순으로 받는 계정 이름과 지금 기기 수를 함께 읽는다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Db;
      const customer = await createTestCustomer(tx);
      const shop = await createTestShop(tx);
      await tx.insert(pushSubscriptions).values({
        userId: customer.userId,
        accountType: 'customer',
        endpoint: `https://push.example/${customer.userId}`,
        p256dh: 'p',
        auth: 'a',
      });
      const failed = await addNotification(tx, {
        userId: customer.userId,
        accountType: 'customer',
        status: 'failed',
        createdAt: new Date(NOW.getTime() - 60_000),
        title: '예약이 확정됐어요',
      });
      const noDevice = await addNotification(tx, {
        userId: shop.createdBy,
        accountType: 'owner',
        status: 'no_device',
        createdAt: new Date(NOW.getTime() - 120_000),
        title: '새 예약이 들어왔어요',
      });
      const sent = await addNotification(tx, {
        userId: customer.userId,
        accountType: 'customer',
        status: 'sent',
        createdAt: NOW,
        title: '보낸 알림',
      });
      const old = await addNotification(tx, {
        userId: customer.userId,
        accountType: 'customer',
        status: 'failed',
        createdAt: new Date(NOW.getTime() - 91 * DAY),
        title: '오래된 알림',
      });

      const counts = await countNotificationIssues(db, NOW);
      expect(counts.failed).toBeGreaterThanOrEqual(1);
      expect(counts.no_device).toBeGreaterThanOrEqual(1);

      const failedPage = await selectNotificationIssues(db, {
        tab: 'failed',
        page: 1,
        now: NOW,
        total: counts.failed,
      });
      const failedIds = failedPage.rows.map((row) => row.notificationId);
      expect(failedIds).toContain(failed);
      expect(failedIds).not.toContain(sent);
      expect(failedIds).not.toContain(old);
      expect(failedPage.rows.find((row) => row.notificationId === failed)).toMatchObject({
        accountType: 'customer',
        recipientName: '테스트 고객',
        title: '예약이 확정됐어요',
        body: '내용',
        error: 'expired',
        readAt: null,
        devices: 1,
      });

      const noDevicePage = await selectNotificationIssues(db, {
        tab: 'no_device',
        page: 1,
        now: NOW,
        total: counts.no_device,
      });
      expect(noDevicePage.rows.find((row) => row.notificationId === noDevice)).toMatchObject({
        accountType: 'owner',
        recipientName: '테스트 미용실',
        title: '새 예약이 들어왔어요',
        devices: 0,
      });
      expect(noDevicePage.rows.map((row) => row.notificationId)).not.toContain(failed);
    });
  });
});
