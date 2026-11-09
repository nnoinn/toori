// 포트원 웹훅 수신 기록 (X-204, W13). 서버에서만 부른다.

import 'server-only';

import { eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { webhookEvents } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

/**
 * 받은 웹훅을 기록한다. 처리를 끝낸 웹훅이면 false. 앞선 처리가 끝나지 못한 웹훅(포트원이 다시 보냄)은 true라서 다시 처리한다.
 * 같은 웹훅이 동시에 와도 처리 함수들이 다시 불러도 같은 결과라서 괜찮다
 */
export async function beginWebhookEvent(
  db: Pick<Db, 'insert' | 'select'>,
  event: { webhookId: string; type: string; payload: unknown; now: Date },
): Promise<boolean> {
  await db
    .insert(webhookEvents)
    .values({
      webhookId: event.webhookId,
      type: event.type,
      payload: event.payload,
      receivedAt: event.now,
    })
    .onConflictDoNothing({ target: webhookEvents.webhookId });
  const [row] = await db
    .select({ processedAt: webhookEvents.processedAt })
    .from(webhookEvents)
    .where(eq(webhookEvents.webhookId, event.webhookId));
  return row?.processedAt === null;
}

/** 처리를 끝낸 웹훅과 그 결과를 기록한다 */
export async function finishWebhookEvent(
  db: Pick<Db, 'update'>,
  input: { webhookId: string; result: string; now: Date },
): Promise<void> {
  await db
    .update(webhookEvents)
    .set({ processedAt: input.now, result: input.result })
    .where(eq(webhookEvents.webhookId, input.webhookId));
}
