// 쓰이지 않는 사업자등록증 지우기 (#478, 11/17 nnoinn). 무엇을 지울지(어느 샵도 가리키지 않고 쓰이지 않게 된 지 30일),
// 지우지 않는 것(지금 쓰는 파일, 폴더 밖 파일, 30일이 안 된 파일), 목록을 못 읽거나 지우다 실패할 때를 본다.
// DB 목록 읽기와 Storage 지우기는 가짜로 바꾼다(CI 테스트 DB에는 Storage 표가 없다).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';
import { BUSINESS_DOC_KEEP_DAYS } from '@/server/policy';

const state = vi.hoisted(() => ({
  removed: [] as string[][],
  removeError: null as { message: string } | null,
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

const { cleanUpBusinessDocs, pickStaleBusinessDocs } = await import('./business-doc-cleanup');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-01T04:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const doc = (path: string, days: number) => ({ path, createdAt: daysAgo(days) });
const ref = (shopId: string, ownerUserId: string, path: string) => ({ shopId, ownerUserId, path });

beforeEach(() => {
  state.removed = [];
  state.removeError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('pickStaleBusinessDocs', () => {
  it('가입하다 그만둔 사람(샵 없음)의 등록증은 올린 지 30일부터 지운다(딱 30일 포함)', () => {
    const objects = [
      doc('users/u-quit/a.pdf', BUSINESS_DOC_KEEP_DAYS),
      doc('users/u-quit/b.jpg', BUSINESS_DOC_KEEP_DAYS - 1),
    ];
    expect(pickStaleBusinessDocs(objects, [], NOW)).toEqual(['users/u-quit/a.pdf']);
    expect(BUSINESS_DOC_KEEP_DAYS).toBe(30);
  });

  it('다시 낸 경우의 옛 등록증은 지금 쓰는 등록증을 올린 날(다시 낸 날)부터 30일이 지나야 지운다', () => {
    const refs = [ref('s-1', 'u-1', 'shops/s-1/new.pdf')];
    // 옛 파일은 오래됐지만 다시 낸 지 10일이라 아직 둔다
    expect(
      pickStaleBusinessDocs(
        [doc('users/u-1/old.pdf', 60), doc('shops/s-1/new.pdf', 10)],
        refs,
        NOW,
      ),
    ).toEqual([]);
    // 다시 낸 지 30일이 지나면 가입 때 것(users)과 그 샵 폴더의 옛 것(shops) 모두 지운다
    expect(
      pickStaleBusinessDocs(
        [
          doc('users/u-1/old.pdf', 90),
          doc('shops/s-1/older.pdf', 80),
          doc('shops/s-1/new.pdf', 31),
        ],
        refs,
        NOW,
      ),
    ).toEqual(['users/u-1/old.pdf', 'shops/s-1/older.pdf']);
  });

  it('지금 어느 샵이든 가리키는 파일과 두 폴더 밖의 파일은 오래돼도 지우지 않는다', () => {
    const refs = [ref('s-1', 'u-1', 'users/u-1/current.pdf')];
    const objects = [
      doc('users/u-1/current.pdf', 400),
      doc('seed/sample.pdf', 400),
      doc('loose.pdf', 400),
      doc('users/', 400),
    ];
    expect(pickStaleBusinessDocs(objects, refs, NOW)).toEqual([]);
  });

  it('지금 쓰는 등록증보다 늦게 올린 쓰이지 않는 파일은 그 파일을 올린 날부터 센다', () => {
    const refs = [ref('s-1', 'u-1', 'shops/s-1/current.pdf')];
    const objects = [doc('shops/s-1/current.pdf', 100), doc('shops/s-1/unused.pdf', 20)];
    expect(pickStaleBusinessDocs(objects, refs, NOW)).toEqual([]);
    expect(
      pickStaleBusinessDocs(
        [doc('shops/s-1/current.pdf', 100), doc('shops/s-1/unused.pdf', 30)],
        refs,
        NOW,
      ),
    ).toEqual(['shops/s-1/unused.pdf']);
  });

  it('샵의 등록증 경로가 파일로 없으면(시드) 그 샵 폴더의 쓰이지 않는 파일은 올린 날부터 센다', () => {
    const refs = [ref('s-1', 'u-1', 'seed/missing.pdf')];
    expect(pickStaleBusinessDocs([doc('shops/s-1/x.pdf', 31)], refs, NOW)).toEqual([
      'shops/s-1/x.pdf',
    ]);
  });
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
      execute: async () => {
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

  it('지울 것이 없으면 Storage를 부르지 않는다', async () => {
    const db = fakeDb({ objects: [{ name: 'users/u-quit/a.pdf', created_at: daysAgo(1) }] });
    expect(await cleanUpBusinessDocs(db, NOW)).toEqual({ checked: 1, deleted: 0, failed: 0 });
    expect(state.removed).toEqual([]);
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

  it('목록을 읽지 못하면 지우지 않고 unavailable을 돌려준다(알림 작업 결과는 그대로)', async () => {
    expect(await cleanUpBusinessDocs(fakeDb({ fail: true }), NOW)).toEqual({
      error: 'unavailable',
    });
    expect(state.removed).toEqual([]);
  });
});
