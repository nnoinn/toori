// 쓰이지 않는 사업자등록증 고르기 (#478, 11/17 nnoinn). 무엇을 지울지(어느 샵도 가리키지 않고 쓰이지 않게 된 지 30일),
// 지우지 않는 것(지금 쓰는 파일, 폴더 밖 파일, 30일이 안 된 파일)을 본다. 목록 읽기·지우기는 business-doc-cleanup.test.ts

import { describe, expect, it } from 'vitest';

import { BUSINESS_DOC_KEEP_DAYS } from '@/server/policy';

import { pickStaleBusinessDocs } from './business-doc-rules';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-01T04:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const doc = (path: string, days: number) => ({ path, createdAt: daysAgo(days) });
const ref = (shopId: string, ownerUserId: string, path: string) => ({ shopId, ownerUserId, path });

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
    // 옛 파일(가입 때 것, 그 샵 폴더의 옛 것)은 오래됐지만 다시 낸 지 10일이라 아직 둔다
    expect(
      pickStaleBusinessDocs(
        [
          doc('users/u-1/old.pdf', 60),
          doc('shops/s-1/older.pdf', 80),
          doc('shops/s-1/new.pdf', 10),
        ],
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

  it('다른 원장님·다른 샵이 최근에 낸 등록증은 이 폴더의 날짜 계산에 쓰지 않는다', () => {
    const refs = [ref('s-2', 'u-2', 'shops/s-2/new.pdf')];
    const objects = [
      doc('users/u-quit/a.pdf', 40),
      doc('shops/s-9/a.pdf', 40),
      doc('shops/s-2/new.pdf', 5),
    ];
    expect(pickStaleBusinessDocs(objects, refs, NOW)).toEqual([
      'users/u-quit/a.pdf',
      'shops/s-9/a.pdf',
    ]);
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
