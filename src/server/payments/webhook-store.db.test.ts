// 포트원 웹훅 수신 기록을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 같은 웹훅이 다시 오면 한 줄만 남고, 처리를 끝낸 웹훅만 건너뛴다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { webhookEvents } from '@/db/schema';

import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { beginWebhookEvent, finishWebhookEvent } from './webhook-store';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const event = {
  webhookId: 'test_webhook_1',
  type: 'Transaction.Paid',
  payload: { data: { paymentId: 'test_1' } },
  now: NOW,
};

describeDb('웹훅 수신 기록 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('처음 받으면 내용을 기록하고 처리한다', async () => {
    await withRollback(async (tx) => {
      expect(await beginWebhookEvent(tx, event)).toBe(true);
      const [row] = await tx
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.webhookId, event.webhookId));
      expect(row).toMatchObject({
        type: 'Transaction.Paid',
        payload: event.payload,
        receivedAt: NOW,
        processedAt: null,
        result: null,
      });
    });
  });

  it('처리를 끝내지 못한 웹훅이 다시 오면 한 줄만 남기고 다시 처리한다', async () => {
    await withRollback(async (tx) => {
      await beginWebhookEvent(tx, event);
      expect(await beginWebhookEvent(tx, event)).toBe(true);
      const rows = await tx
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.webhookId, event.webhookId));
      expect(rows).toHaveLength(1);
    });
  });

  it('처리를 끝낸 웹훅이 다시 오면 건너뛰고 결과를 남겨 둔다', async () => {
    await withRollback(async (tx) => {
      await beginWebhookEvent(tx, event);
      await finishWebhookEvent(tx, { webhookId: event.webhookId, result: 'confirmed', now: NOW });
      expect(await beginWebhookEvent(tx, event)).toBe(false);
      const [row] = await tx
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.webhookId, event.webhookId));
      expect(row).toMatchObject({ processedAt: NOW, result: 'confirmed' });
    });
  });
});
