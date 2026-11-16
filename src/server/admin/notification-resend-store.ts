// 운영자 알림 다시 보내기(#373 ⑤)의 읽기·저장. 서버에서만 부른다.
// 보내기는 notify와 같은 sendToDevices가 하고, 여기는 다시 보낼 알림 읽기와 상태 바꾸기만 한다.

import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import { type AccountType, notifications } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

/** 다시 보낼 수 있는 상태: 보내지 못함 / 받을 기기가 없었음 */
export const RESENDABLE_STATUSES = ['failed', 'no_device'] as const;

export type ResendNotification = {
  id: string;
  userId: string;
  accountType: AccountType;
  status: string;
  payload: unknown;
};

/** 다시 보낼 알림. 없으면 null */
export async function readResendNotification(
  db: Pick<Db, 'select'>,
  notificationId: string,
): Promise<ResendNotification | null> {
  const [row] = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      accountType: notifications.accountType,
      status: notifications.status,
      payload: notifications.payload,
    })
    .from(notifications)
    .where(eq(notifications.id, notificationId));
  return row ? { ...row, accountType: row.accountType as AccountType } : null;
}

/**
 * 다시 보내기 자리를 잡는다: 보내지 못함·기기 없음인 알림만 sent로 바꾸고 true.
 * 두 운영자가 동시에 눌러도 한 명만 잡아서 한 번만 간다. 이미 sent면 false
 */
export async function claimNotificationResend(
  db: Pick<Db, 'update'>,
  notificationId: string,
): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ status: 'sent', error: null })
    .where(
      and(
        eq(notifications.id, notificationId),
        inArray(notifications.status, ['failed', 'no_device', 'sent']),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** 한 기기도 받지 못했으면 failed와 기기마다 결과를 남긴다 */
export async function markResendFailed(
  db: Pick<Db, 'update'>,
  notificationId: string,
  error: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ status: 'failed', error })
    .where(eq(notifications.id, notificationId));
}
