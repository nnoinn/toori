import { describe, expect, it } from 'vitest';

import { INTEREST_TABS, interestTabHref, parseInterestTab } from './interest-tabs';

describe('관심 화면 탭 (C-211)', () => {
  it('[매물 보기]가 먼저이고 기본이다', () => {
    expect(INTEREST_TABS.map((tab) => tab.label)).toEqual(['매물 보기', '샵 보기']);
    expect(parseInterestTab(undefined)).toBe('slots');
    expect(parseInterestTab('모르는 값')).toBe('slots');
  });

  it('주소창 값으로 고르고, 여러 번 오면 첫 번째', () => {
    expect(parseInterestTab('shops')).toBe('shops');
    expect(parseInterestTab(['shops', 'slots'])).toBe('shops');
  });

  it('기본 탭은 주소를 짧게, 샵 보기는 ?tab=shops', () => {
    expect(interestTabHref('slots')).toBe('/home/favorites');
    expect(interestTabHref('shops')).toBe('/home/favorites?tab=shops');
  });
});
