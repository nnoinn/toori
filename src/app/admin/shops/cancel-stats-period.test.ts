// 운영자 샵 상세 '취소 기록'의 기간 고르기(#486). 주소 값 읽기, 한국 날짜 기간을 조회 범위로 바꾸기(끝일 하루 포함), 잘못된 기간, 주소·이름을 본다.

import { describe, expect, it } from 'vitest';

import {
  cancelStatsHref,
  labelCancelStatsPeriod,
  readCancelStatsSearch,
  toCancelStatsRange,
} from './cancel-stats-period';

const SHOP = '98ce1bdb-17d0-4ef8-bc2a-76e7014d701d';
const kstMidnight = (date: string) => new Date(`${date}T00:00:00+09:00`);

describe('readCancelStatsSearch', () => {
  it('cancelFrom·cancelTo를 읽고, 빈 값·공백은 없는 것으로, 여러 개면 첫 값을 쓴다', () => {
    expect(readCancelStatsSearch({})).toEqual({ from: undefined, to: undefined });
    expect(readCancelStatsSearch({ cancelFrom: '2026-11-01', cancelTo: ' 2026-11-18 ' })).toEqual({
      from: '2026-11-01',
      to: '2026-11-18',
    });
    expect(readCancelStatsSearch({ cancelFrom: '', cancelTo: '  ' })).toEqual({
      from: undefined,
      to: undefined,
    });
    expect(readCancelStatsSearch({ cancelFrom: ['2026-11-02', '2026-11-03'] }).from).toBe(
      '2026-11-02',
    );
  });
});

describe('toCancelStatsRange', () => {
  it('기간이 없으면 전체 기간, 시작일은 그날 0시(한국)부터, 끝일은 그날 하루를 다 넣는다(다음 날 0시 전)', () => {
    expect(toCancelStatsRange({})).toEqual({ from: null, before: null });
    expect(toCancelStatsRange({ from: '2026-11-01', to: '2026-11-18' })).toEqual({
      from: kstMidnight('2026-11-01'),
      before: kstMidnight('2026-11-19'),
    });
    expect(toCancelStatsRange({ from: '2026-11-01' })).toEqual({
      from: kstMidnight('2026-11-01'),
      before: null,
    });
    expect(toCancelStatsRange({ to: '2026-11-30' })).toEqual({
      from: null,
      before: kstMidnight('2026-12-01'),
    });
  });

  it('시작일과 끝일이 같으면 그날 하루, 달이 바뀌는 끝일도 다음 날 0시까지', () => {
    expect(toCancelStatsRange({ from: '2026-11-18', to: '2026-11-18' })).toEqual({
      from: kstMidnight('2026-11-18'),
      before: kstMidnight('2026-11-19'),
    });
    expect(toCancelStatsRange({ to: '2026-12-31' })?.before).toEqual(kstMidnight('2027-01-01'));
  });

  it('날짜 모양이 틀리거나 없는 날짜이거나 시작일이 끝일보다 늦으면 null', () => {
    for (const period of [
      { from: '2026-11-1' },
      { to: '2026/11/18' },
      { from: 'abc' },
      { from: '2026-02-30' },
      { to: '2026-13-01' },
      { from: '2026-11-19', to: '2026-11-18' },
    ]) {
      expect(toCancelStatsRange(period)).toBeNull();
    }
  });
});

describe('cancelStatsHref / labelCancelStatsPeriod', () => {
  it('고른 끝만 주소에 넣고, 둘 다 없으면 샵 상세 주소 그대로', () => {
    expect(cancelStatsHref(SHOP, { from: '2026-11-01', to: '2026-11-18' })).toBe(
      `/admin/shops/${SHOP}?cancelFrom=2026-11-01&cancelTo=2026-11-18`,
    );
    expect(cancelStatsHref(SHOP, { to: '2026-11-18' })).toBe(
      `/admin/shops/${SHOP}?cancelTo=2026-11-18`,
    );
    expect(cancelStatsHref(SHOP, {})).toBe(`/admin/shops/${SHOP}`);
  });

  it('제목 옆 이름: 기간·시작만·끝만·전체 기간, 해가 다르면 연도도', () => {
    expect(labelCancelStatsPeriod({ from: '2026-11-01', to: '2026-11-18' })).toBe('11/1~11/18');
    expect(labelCancelStatsPeriod({ from: '2026-12-20', to: '2027-01-05' })).toBe(
      '2026/12/20~2027/1/5',
    );
    expect(labelCancelStatsPeriod({ from: '2026-11-01' })).toBe('11/1부터');
    expect(labelCancelStatsPeriod({ to: '2026-11-18' })).toBe('11/18까지');
    expect(labelCancelStatsPeriod({})).toBe('전체 기간');
  });
});
