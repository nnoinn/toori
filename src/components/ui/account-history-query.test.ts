// 계정 이력(#374) 화면 주소 값 읽기와 주소 만들기. 기댓값은 운영자 [이력 보기]의 규칙(11/15 nnoinn). 11/22부터 운영자 화면도 이 파일을 쓴다

import { describe, expect, it } from 'vitest';

import {
  accountHistoryHref,
  readAccountHistorySearch,
  recentPeriod,
} from './account-history-query';

describe('계정 이력 화면 주소', () => {
  it('빈 값은 없는 것으로, 쪽은 1 이상의 정수만, 그 계정 종류에 없는 종류는 전체로 읽는다', () => {
    expect(
      readAccountHistorySearch({ page: '3', from: '2026-11-01', to: '', kind: 'cancel' }, 'owner'),
    ).toEqual({ page: 3, from: '2026-11-01', to: undefined, category: 'cancel' });
    // 원장님 이력에는 쿠폰 묶음이 없다
    expect(readAccountHistorySearch({ page: '0', kind: 'coupon' }, 'owner')).toEqual({
      page: undefined,
      from: undefined,
      to: undefined,
      category: undefined,
    });
    expect(readAccountHistorySearch({ page: '1.5', kind: 'settlement' }, 'owner')).toMatchObject({
      page: undefined,
      category: 'settlement',
    });
    expect(
      readAccountHistorySearch({ page: ['2', '5'], kind: 'coupon' }, 'customer'),
    ).toMatchObject({
      page: 2,
      category: 'coupon',
    });
  });

  it('주소에는 고른 것만, 1쪽은 빼고 쓴다', () => {
    const path = '/owner/account/history';
    expect(accountHistoryHref(path, {})).toBe(path);
    expect(accountHistoryHref(path, { page: 1, category: 'slot' })).toBe(`${path}?kind=slot`);
    expect(accountHistoryHref(path, { from: '2026-11-01', to: '2026-11-14', page: 2 })).toBe(
      `${path}?from=2026-11-01&to=2026-11-14&page=2`,
    );
  });

  it('최근 N일은 오늘을 넣어 N일, 달이 바뀌어도 맞다', () => {
    expect(recentPeriod('2026-11-15', 7)).toEqual({ from: '2026-11-09', to: '2026-11-15' });
    expect(recentPeriod('2026-11-15', 30)).toEqual({ from: '2026-10-17', to: '2026-11-15' });
    expect(recentPeriod('2026-03-01', 1)).toEqual({ from: '2026-03-01', to: '2026-03-01' });
  });
});
