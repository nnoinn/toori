import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getRequestNow } from '@/lib/request-time';
import { fail, ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import {
  countMyUnreadNotifications,
  listMyNotifications,
  listMyNotificationsSince,
  markNotificationsRead,
} from './fake-actions';

// 가짜 결과 버전의 바깥 모양(#371). 스위치가 꺼져 있으면(배포 주소) 종이 숨고 아무 알림도 나오지 않는지,
// 고객 모드로 로그인한 계정만 쓰는지(X-102), 맞춘 모양대로 돌려주는지 본다
vi.mock('@/server/auth', () => ({ requireCustomer: vi.fn() }));
vi.mock('@/lib/request-time', () => ({ getRequestNow: vi.fn() }));

const authMock = vi.mocked(requireCustomer);
const now = new Date('2026-11-15T03:00:00.000Z');

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue(ok({ userId: 'user-1', customerId: 'customer-1' }));
  vi.mocked(getRequestNow).mockResolvedValue(now);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'on');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('스위치가 꺼져 있으면(배포 주소·테스트)', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('안 읽은 수는 null이라 종을 숨긴다', async () => {
    expect(await countMyUnreadNotifications()).toEqual(ok(null));
  });

  it('목록과 읽음 처리는 실패하고, 새 알림은 주지 않는다', async () => {
    expect((await listMyNotifications()).ok).toBe(false);
    expect((await markNotificationsRead({ all: true })).ok).toBe(false);
    expect((await listMyNotificationsSince(now.toISOString())).ok).toBe(false);
  });
});

describe('로그인 안 함·원장님 모드면', () => {
  beforeEach(() => {
    authMock.mockResolvedValue(fail('WRONG_MODE', '고객으로 로그인해 주세요'));
  });

  it('안 읽은 수는 null(종 숨김)이고 목록은 그 실패를 그대로 돌려준다', async () => {
    expect(await countMyUnreadNotifications()).toEqual(ok(null));
    expect(await listMyNotifications()).toEqual(fail('WRONG_MODE', '고객으로 로그인해 주세요'));
  });
});

describe('스위치가 켜져 있고 고객으로 로그인했으면', () => {
  it('첫 장은 20개, 다음 장으로 나머지를 준다', async () => {
    const first = await listMyNotifications();
    if (!first.ok) throw new Error('첫 장을 받지 못했어요');
    expect(first.data.items).toHaveLength(20);
    expect(first.data.serverNow).toBe(now.toISOString());
    const second = await listMyNotifications({ cursor: first.data.nextCursor ?? '' });
    if (!second.ok) throw new Error('다음 장을 받지 못했어요');
    expect(second.data.items).toHaveLength(5);
    expect(second.data.nextCursor).toBeNull();
  });

  it('읽음으로 바꾸면 안 읽은 수가 줄고, 모두 읽음 뒤에는 0이다', async () => {
    const before = await countMyUnreadNotifications();
    if (!before.ok || before.data === null) throw new Error('안 읽은 수를 받지 못했어요');
    expect(before.data).toBeGreaterThan(1);
    expect(await markNotificationsRead({ ids: ['fake-01'] })).toEqual(ok({ count: 1 }));
    expect(await countMyUnreadNotifications()).toEqual(ok(before.data - 1));
    expect(await markNotificationsRead({ all: true })).toEqual(ok({ count: before.data - 1 }));
    expect(await countMyUnreadNotifications()).toEqual(ok(0));
  });

  it('잘못된 입력은 받지 않는다', async () => {
    expect((await markNotificationsRead({ ids: [] })).ok).toBe(false);
    expect((await listMyNotifications({ limit: 0 })).ok).toBe(false);
    expect((await listMyNotificationsSince('어제')).ok).toBe(false);
  });

  it('empty는 빈 알림함, error는 실패를 돌려준다', async () => {
    vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'empty');
    expect(await listMyNotifications()).toEqual(
      ok({ items: [], nextCursor: null, serverNow: now.toISOString() }),
    );
    expect(await countMyUnreadNotifications()).toEqual(ok(0));
    vi.stubEnv('DEV_FAKE_NOTIFICATIONS', 'error');
    expect((await listMyNotifications()).ok).toBe(false);
    expect((await countMyUnreadNotifications()).ok).toBe(false);
  });
});
