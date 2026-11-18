// 쓰이지 않는 사업자등록증 지우기 (#478, 11/17 nnoinn). 목록 읽기, 나눠 지우기, 목록을 못 읽거나 지우다 실패할 때를 본다.
// 무엇을 지울지(고르기)는 business-doc-rules.test.ts. DB 목록 읽기와 Storage 지우기는 가짜로 바꾼다(CI 테스트 DB에는 Storage 표가 없다).

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const state = vi.hoisted(() => ({
  removed: [] as string[][],
  removeError: null as { message: string } | null,
  executed: [] as unknown[],
}));

vi.mock('@/server/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          state.removed.push([bucket, ...paths]);
          return { error: state.removeError };
        },
      }),
    },
  }),
}));

const { cleanUpBusinessDocs } = await import('./business-doc-cleanup');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-01T04:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const ref = (shopId: string, ownerUserId: string, path: string) => ({ shopId, ownerUserId, path });

beforeEach(() => {
  state.removed = [];
  state.removeError = null;
  state.executed = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('cleanUpBusinessDocs', () => {
  function fakeDb(input: {
    objects?: { name: string; created_at: Date | string }[];
    refs?: { shopId: string; ownerUserId: string; path: string }[];
    fail?: boolean;
  }) {
    const chain = {
      from: () => chain,
      innerJoin: async () => input.refs ?? [],
    };
    return {
      execute: async (query: SQL) => {
        state.executed.push(query);
        if (input.fail) throw new Error('relation "storage.objects" does not exist');
        return input.objects ?? [];
      },
      select: () => chain,
    } as unknown as ReturnType<typeof getDb>;
  }

  it('고른 파일을 business-docs 버킷에서 지우고 확인·지운·실패 수를 돌려준다', async () => {
    const db = fakeDb({
      objects: [
        { name: 'users/u-quit/a.pdf', created_at: daysAgo(40).toISOString() },
        { name: 'users/u-1/current.pdf', created_at: daysAgo(40) },
      ],
      refs: [ref('s-1', 'u-1', 'users/u-1/current.pdf')],
    });
    expect(await cleanUpBusinessDocs(db, NOW)).toEqual({ checked: 2, deleted: 1, failed: 0 });
    expect(state.removed).toEqual([['business-docs', 'users/u-quit/a.pdf']]);
  });

  it('파일 목록은 storage.objects에서 business-docs 버킷 것만 읽는다', async () => {
    await cleanUpBusinessDocs(fakeDb({}), NOW);
    expect(state.executed).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(state.executed[0] as SQL);
    expect(query.sql).toContain('from storage.objects');
    expect(query.params).toEqual(['business-docs']);
  });

  it('지울 것이 없으면 Storage를 부르지 않는다', async () => {
    const remove = vi.fn(async () => 0);
    const db = fakeDb({ objects: [{ name: 'users/u-quit/a.pdf', created_at: daysAgo(1) }] });
    expect(await cleanUpBusinessDocs(db, NOW, remove)).toEqual({
      checked: 1,
      deleted: 0,
      failed: 0,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('100개씩 나눠 지우고, 실패한 묶음은 실패 수로 남긴다(던지지 않는다, 다음 날 다시 한다)', async () => {
    const objects = Array.from({ length: 150 }, (_, i) => ({
      name: `users/u-${i}/a.pdf`,
      created_at: daysAgo(40),
    }));
    state.removeError = { message: 'storage unavailable' };
    expect(await cleanUpBusinessDocs(fakeDb({ objects }), NOW)).toEqual({
      checked: 150,
      deleted: 0,
      failed: 150,
    });
    expect(state.removed.map((batch) => batch.length - 1)).toEqual([100, 50]);
  });

  it('딱 100개면 한 번에 지운다(빈 묶음으로 다시 부르지 않는다)', async () => {
    const objects = Array.from({ length: 100 }, (_, i) => ({
      name: `users/u-${i}/a.pdf`,
      created_at: daysAgo(40),
    }));
    expect(await cleanUpBusinessDocs(fakeDb({ objects }), NOW)).toEqual({
      checked: 100,
      deleted: 100,
      failed: 0,
    });
    expect(state.removed.map((batch) => batch.length - 1)).toEqual([100]);
  });

  it('지우기가 던지면(Storage 연결 실패 등) 고른 파일 모두를 실패 수로 남기고 던지지 않는다', async () => {
    const db = fakeDb({
      objects: [
        { name: 'users/u-quit/a.pdf', created_at: daysAgo(40) },
        { name: 'users/u-quit/b.pdf', created_at: daysAgo(40) },
      ],
    });
    const remove = async () => {
      throw new Error('storage client unavailable');
    };
    expect(await cleanUpBusinessDocs(db, NOW, remove)).toEqual({
      checked: 2,
      deleted: 0,
      failed: 2,
    });
  });

  it('목록을 읽지 못하면 지우지 않고 unavailable을 돌려준다(알림 작업 결과는 그대로)', async () => {
    expect(await cleanUpBusinessDocs(fakeDb({ fail: true }), NOW)).toEqual({
      error: 'unavailable',
    });
    expect(state.removed).toEqual([]);
  });
});
