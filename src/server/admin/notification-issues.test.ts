// 운영자 화면 위 알림 종(#373 ⑤). 운영자만 열리고, 종 숫자는 보내지 못한 알림 수, 상자는 최근 5개인지 본다.
// DB는 가짜로 바꿔서 DB 없이 돈다. 어떤 알림을 고르는지는 notification-issues-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

const NOW = new Date('2026-11-16T03:00:00.000Z');

const state = vi.hoisted(() => ({
  admin: null as unknown,
  recentInputs: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-11-16T03:00:00.000Z'),
}));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.admin }));
vi.mock('./notification-issues-store', () => ({
  countNotificationIssues: async () => ({ failed: 3, no_device: 12 }),
  selectRecentNotificationIssues: async (_db: unknown, input: unknown) => {
    state.recentInputs.push(input);
    return [
      {
        notificationId: 'n-1',
        status: 'failed',
        title: '예약이 확정됐어요',
        createdAt: NOW.toISOString(),
      },
    ];
  },
}));

const { getNotificationIssueBell } = await import('./notification-issues');

beforeEach(() => {
  state.admin = ok({ userId: 'admin-1' });
  state.recentInputs = [];
});

describe('운영자 알림 종', () => {
  it('종 숫자는 보내지 못한 알림 수이고, 상자에는 최근 알림 5개를 지금 시각 기준으로 읽는다', async () => {
    expect(await getNotificationIssueBell()).toEqual(
      ok({
        failedCount: 3,
        items: [
          {
            notificationId: 'n-1',
            status: 'failed',
            title: '예약이 확정됐어요',
            createdAt: NOW.toISOString(),
          },
        ],
      }),
    );
    expect(state.recentInputs).toEqual([{ now: NOW, limit: 5 }]);
  });

  it('운영자로 들어오지 않았으면 그 실패를 그대로 주고 DB를 읽지 않는다', async () => {
    state.admin = fail('FORBIDDEN', '접근 권한이 없어요');
    expect(await getNotificationIssueBell()).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    expect(state.recentInputs).toEqual([]);
  });
});
