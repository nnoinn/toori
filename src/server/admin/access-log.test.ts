// 운영자 열람 기록 (#269). IP 읽기와 넣는 값은 DB 없이, 실제 저장은 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminAccessLogs } from '@/db/schema';

import { createTestUser } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  inserted: [] as unknown[],
  fail: false,
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => state.headers.get(name) ?? null }),
}));
vi.mock('@/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/db')>()),
  getDb: () => ({
    insert: () => ({
      values: async (row: unknown) => {
        if (state.fail) throw new Error('db down');
        state.inserted.push(row);
      },
    }),
  }),
}));

const { clientIp, insertAdminAccess, recordAdminAccess } = await import('./access-log');

const header = (entries: Record<string, string>) => ({
  get: (name: string) => entries[name] ?? null,
});

beforeEach(() => {
  state.headers.clear();
  state.inserted = [];
  state.fail = false;
});

describe('clientIp', () => {
  it('x-forwarded-for의 첫 값(접속한 쪽), 없으면 x-real-ip, 둘 다 없으면 null', () => {
    expect(clientIp(header({ 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(header({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(header({ 'x-forwarded-for': ' ', 'x-real-ip': '198.51.100.2' }))).toBe(
      '198.51.100.2',
    );
    expect(clientIp(header({}))).toBeNull();
  });
});

describe('recordAdminAccess', () => {
  it('지금 요청의 IP와 함께 한 줄 넣는다. 빈 검색어와 대상은 비워 둔다', async () => {
    state.headers.set('x-forwarded-for', '203.0.113.7');
    await recordAdminAccess('admin-1', {
      action: 'search',
      targetType: 'list',
      path: '/admin/users?tab=customers',
      query: '',
    });
    expect(state.inserted).toEqual([
      {
        adminId: 'admin-1',
        action: 'search',
        targetType: 'list',
        targetId: null,
        path: '/admin/users?tab=customers',
        query: null,
        ip: '203.0.113.7',
      },
    ]);
  });

  it('기록을 넣지 못하면 오류를 던진다(화면이 개인정보를 보여주지 않게)', async () => {
    state.fail = true;
    await expect(
      recordAdminAccess('admin-1', {
        action: 'view',
        targetType: 'customer',
        targetId: 'c-1',
        path: '/admin/users/customers/c-1',
      }),
    ).rejects.toThrow('db down');
  });
});

describeDb('운영자 열람 기록 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('상세 보기와 목록 검색을 그대로 저장한다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const targetId = '00000000-0000-4000-8000-000000000001';
      await insertAdminAccess(tx, {
        adminId,
        action: 'view',
        targetType: 'reservation',
        targetId,
        path: `/admin/reservations/${targetId}`,
        ip: '203.0.113.7',
      });
      await insertAdminAccess(tx, {
        adminId,
        action: 'search',
        targetType: 'list',
        path: '/admin/users?tab=customers',
        query: '010-1234',
        ip: null,
      });
      const rows = await tx
        .select()
        .from(adminAccessLogs)
        .where(eq(adminAccessLogs.adminId, adminId));
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'view', targetId, query: null, ip: '203.0.113.7' }),
          expect.objectContaining({
            action: 'search',
            targetId: null,
            query: '010-1234',
            ip: null,
          }),
        ]),
      );
      expect(rows[0].createdAt).toBeInstanceOf(Date);
    });
  });
});
