'use server';

// 운영자 알림 다시 보내기 (#373 ⑤). 운영자 화면 /admin/notifications(알림 확인)에서 부른다. 운영자만(requireAdmin), 사유 필수.
// 보내지 못한 알림(failed)과 받을 기기가 없던 알림(no_device, #371)을 지금 그 계정의 푸시 알림 기기로 한 번 더 보낸다.
// 알림함에는 처음부터 남아 있으므로 푸시만 다시 보낸다. 보내기는 notify와 같은 sendToDevices다.
// 먼저 sent로 자리를 잡아서 두 운영자가 동시에 눌러도 한 번만 가고, 한 기기도 받지 못하면 failed로 되돌린다.
// 결과와 사유는 운영자 처리 기록(notification.resend, "sent|failed: 사유")에 남는다

import { z } from 'zod';

import { getDb } from '@/db';
import { requireAdmin } from '@/server/auth';
import { readNotificationPayload } from '@/server/notifications/inbox-store';
import { sendToDevices } from '@/server/notifications/notify';
import { readPushTargets } from '@/server/notifications/subscription-store';

import { recordAdminAction } from './action-store';
import {
  notificationResendFail,
  type NotificationResendResult,
} from './notification-resend-errors';
import {
  claimNotificationResend,
  markResendFailed,
  readResendNotification,
  RESENDABLE_STATUSES,
} from './notification-resend-store';
import { toAdminReason } from './reason';

/** 처리 기록에 남기는 한 일 */
export type ResendOutcome = 'sent' | 'failed';

const idSchema = z.uuid();

function isResendable(status: string): boolean {
  return (RESENDABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * 알림 [다시 보내기]. 없는 알림이면 NOTIFICATION_NOT_FOUND, 이미 보냈으면 ALREADY_SENT,
 * 받는 계정에 푸시 알림을 켠 기기가 아직 없으면 NO_DEVICE(그대로 둔다)
 */
export async function resendNotification(input: {
  notificationId: string;
  reason: string;
}): Promise<NotificationResendResult<{ result: ResendOutcome; devices: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.notificationId).success) {
    return notificationResendFail('NOTIFICATION_NOT_FOUND');
  }
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return notificationResendFail(reason.problem);
  const db = getDb();

  const notification = await readResendNotification(db, input.notificationId);
  if (!notification) return notificationResendFail('NOTIFICATION_NOT_FOUND');
  if (!isResendable(notification.status)) return notificationResendFail('ALREADY_SENT');
  const targets = await readPushTargets(db, {
    userId: notification.userId,
    accountType: notification.accountType,
  });
  if (targets.length === 0) return notificationResendFail('NO_DEVICE');
  if (!(await claimNotificationResend(db, notification.id))) {
    return notificationResendFail('ALREADY_SENT');
  }

  const results = await sendToDevices(db, targets, {
    ...readNotificationPayload(notification.payload),
    accountType: notification.accountType,
  });
  const result: ResendOutcome = results.includes('sent') ? 'sent' : 'failed';
  await db.transaction(async (tx) => {
    if (result === 'failed') await markResendFailed(tx, notification.id, results.join(','));
    await recordAdminAction(tx, {
      adminId: auth.data.userId,
      action: 'notification.resend',
      targetType: 'notification',
      targetId: notification.id,
      memo: `${result}: ${reason.reason}`,
    });
  });
  return { ok: true, data: { result, devices: targets.length } };
}
