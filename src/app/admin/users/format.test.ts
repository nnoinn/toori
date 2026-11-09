// 회원 조회 화면 표시 모양 (A-102, W18). 탭 읽기를 본다. 검색어·예약 상태 이름은 ../lookup.test.ts

import { describe, expect, it } from 'vitest';

import { toUserTab } from './format';

describe('회원 조회 표시 모양', () => {
  it('탭은 owners만 원장님이고 나머지는 고객', () => {
    expect(toUserTab('owners')).toBe('owners');
    expect(toUserTab('customers')).toBe('customers');
    expect(toUserTab(undefined)).toBe('customers');
    expect(toUserTab('admin')).toBe('customers');
  });
});
