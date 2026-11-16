// 운영자 알림 다시 보내기 (#373 ⑤). 권한·사유, 다시 보낼 수 있는지, 같은 내용으로 보내는지, 결과와 처리 기록을 본다.
// DB·보내기는 가짜로 바꿔서 DB 없이 돈다. 자리 잡기가 한 번만 되는지는 notification-resend-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

const NOTIFICATION_ID = '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a';
const ADMIN_ID = '5e6f7a8b-9c0d-4e1f-9a2b-3c4d5e6f7a8b';
const USER_ID = '6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c';

const state = vi.hoisted(() => ({
  admin: null as unknown,
  notification: null as unknown,
  targets: [] as { endpoint: string }[],
  claimed: true,
  results: [] as string[],
  calls: [] as [string, unknown][],
}));

vi.mock('@/db', () => ({
  getDb: () => ({
    transaction: async (fn: (tx: string) => Promise<void>) => fn('tx'),
  }),
}));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.admin }));
vi.mock('@/server/notifications/subscription-store', () => ({
  readPushTargets: async (_db: unknown, input: unknown) => {
    state.calls.push(['targets', input]);
    return state.targets;
  },
}));
vi.mock('@/server/notifications/notify', () => ({
  sendToDevices: async (_db: unknown, targets: unknown, message: unknown) => {
    state.calls.push(['send', { targets, message }]);
    return state.results;
  },
}));
vi.mock('./notification-resend-store', async (original) => ({
  ...(await original<typeof import('./notification-resend-store')>()),
  readResendNotification: async () => state.notification,
  claimNotificationResend: async (_db: unknown, id: string) => {
    state.calls.push(['claim', id]);
    return state.claimed;
  },
  markResendFailed: async (db: unknown, id: string, error: string) => {
    state.calls.push(['failed', { db, id, error }]);
  },
}));
vi.mock('./action-store', () => ({
  recordAdminAction: async (db: unknown, row: unknown) => {
    state.calls.push(['action', { db, row }]);
  },
}));

const { resendNotification } = await import('./notification-resend');

const INPUT = { notificationId: NOTIFICATION_ID, reason: '  손님이 푸시 알림을 켰다고 연락함 ' };

beforeEach(() => {
  state.admin = ok({ userId: ADMIN_ID });
  state.notification = {
    id: NOTIFICATION_ID,
    userId: USER_ID,
    accountType: 'customer',
    status: 'no_device',
    payload: { title: '예약이 확정됐어요', body: '샘플 헤어 · 11/17(월) 14:00', url: '/reservations/r-1' },
  };
  state.targets = [{ endpoint: 'a' }, { endpoint: 'b' }];
  state.claimed = true;
  state.results = ['sent', 'expired'];
  state.calls = [];
});

describe('알림 다시 보내기', () => {
  it('지금 그 계정의 푸시 알림 기기로 같은 내용을 보내고, 처리 기록에 결과와 사유를 남긴다', async () => {
    expect(await resendNotification(INPUT)).toEqual(ok({ result: 'sent', devices: 2 }));
    expect(state.calls).toEqual([
      ['targets', { userId: USER_ID, accountType: 'customer' }],
      ['claim', NOTIFICATION_ID],
      [
        'send',
        {
          targets: state.targets,
          message: {
            title: '예약이 확정됐어요',
            body: '샘플 헤어 · 11/17(월) 14:00',
            url: '/reservations/r-1',
            accountType: 'customer',
          },
        },
      ],
      [
        'action',
        {
          db: 'tx',
          row: {
            adminId: ADMIN_ID,
            action: 'notification.resend',
            targetType: 'notification',
            targetId: NOTIFICATION_ID,
            memo: 'sent: 손님이 푸시 알림을 켰다고 연락함',
          },
        },
      ],
    ]);
  });

  it('한 기기도 받지 못하면 failed와 기기마다 결과를 같은 트랜잭션에서 처리 기록과 함께 남긴다', async () => {
    state.notification = { ...(state.notification as object), status: 'failed' };
    state.results = ['expired', 'failed'];
    expect(await resendNotification(INPUT)).toEqual(ok({ result: 'failed', devices: 2 }));
    expect(state.calls.slice(-2)).toEqual([
      ['failed', { db: 'tx', id: NOTIFICATION_ID, error: 'expired,failed' }],
      [
        'action',
        {
          db: 'tx',
          row: expect.objectContaining({ memo: 'failed: 손님이 푸시 알림을 켰다고 연락함' }),
        },
      ],
    ]);
  });

  it('받는 계정에 푸시 알림 기기가 아직 없으면 NO_DEVICE이고 아무것도 바꾸지 않는다', async () => {
    state.targets = [];
    expect(await resendNotification(INPUT)).toMatchObject({
      ok: false,
      error: { code: 'NO_DEVICE' },
    });
    expect(state.calls.map(([kind]) => kind)).toEqual(['targets']);
  });

  it('이미 보낸 알림이거나 다른 운영자가 먼저 자리를 잡았으면 ALREADY_SENT이고 보내지 않는다', async () => {
    state.notification = { ...(state.notification as object), status: 'sent' };
    expect(await resendNotification(INPUT)).toMatchObject({ error: { code: 'ALREADY_SENT' } });
    expect(state.calls).toEqual([]);

    state.notification = { ...(state.notification as object), status: 'failed' };
    state.claimed = false;
    expect(await resendNotification(INPUT)).toMatchObject({ error: { code: 'ALREADY_SENT' } });
    expect(state.calls.map(([kind]) => kind)).toEqual(['targets', 'claim']);
  });

  it('운영자가 아니면 그 실패를 그대로 주고, 사유가 비거나 알림이 없으면 DB를 바꾸지 않는다', async () => {
    state.admin = fail('FORBIDDEN', '접근 권한이 없어요');
    expect(await resendNotification(INPUT)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    state.admin = ok({ userId: ADMIN_ID });
    expect(await resendNotification({ ...INPUT, reason: '   ' })).toMatchObject({
      error: { code: 'REASON_REQUIRED' },
    });
    expect(await resendNotification({ ...INPUT, notificationId: 'n-1' })).toMatchObject({
      error: { code: 'NOTIFICATION_NOT_FOUND' },
    });
    state.notification = null;
    expect(await resendNotification(INPUT)).toMatchObject({
      error: { code: 'NOTIFICATION_NOT_FOUND' },
    });
    expect(state.calls).toEqual([]);
  });
});
