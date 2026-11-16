// 회원 조회 화면 표시 모양 (A-102, W18). 탭·정렬 읽기와 목록 주소를 본다. 검색어·예약 상태 이름은 ../lookup.test.ts

import { describe, expect, it } from 'vitest';

import { toUserSort, toUserTab, usersHref } from './format';

describe('회원 조회 표시 모양', () => {
  it('탭은 owners만 원장님이고 나머지는 고객', () => {
    expect(toUserTab('owners')).toBe('owners');
    expect(toUserTab('customers')).toBe('customers');
    expect(toUserTab(undefined)).toBe('customers');
    expect(toUserTab('admin')).toBe('customers');
  });

  it('정렬은 기본이 최신 가입 순이고, 주소에는 기본 정렬과 빈 검색어를 넣지 않는다', () => {
    expect(toUserSort(undefined)).toBe('latest');
    expect(toUserSort('nope')).toBe('latest');
    expect(toUserSort('name')).toBe('name');
    expect(usersHref({ tab: 'owners' })).toBe('/admin/users?tab=owners');
    expect(usersHref({ tab: 'customers', query: '', sort: 'latest' })).toBe(
      '/admin/users?tab=customers',
    );
    expect(usersHref({ tab: 'owners', query: '샘플', sort: 'oldest' })).toBe(
      `/admin/users?tab=owners&q=${encodeURIComponent('샘플')}&sort=oldest`,
    );
  });
});
