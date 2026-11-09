// 회원 조회 화면 표시 모양 (A-102, W18). 탭·검색어 읽기, 번호 가리기, 예약 상태 이름을 본다.

import { describe, expect, it } from 'vitest';

import { labelReservation, toSearchQuery, toUserTab } from './format';

describe('회원 조회 표시 모양', () => {
  it('탭은 owners만 원장님이고 나머지는 고객', () => {
    expect(toUserTab('owners')).toBe('owners');
    expect(toUserTab('customers')).toBe('customers');
    expect(toUserTab(undefined)).toBe('customers');
    expect(toUserTab('admin')).toBe('customers');
  });

  it('검색어는 앞뒤 공백을 지우고 50자까지만', () => {
    expect(toSearchQuery('  김  ')).toBe('김');
    expect(toSearchQuery(undefined)).toBe('');
    expect(toSearchQuery('가'.repeat(60))).toHaveLength(50);
  });

  it('예약 상태 이름. 노쇼는 이용 완료보다 먼저 본다', () => {
    expect(labelReservation('confirmed', null)).toBe('예정');
    expect(labelReservation('completed', 'visited')).toBe('이용 완료');
    expect(labelReservation('completed', 'no_show')).toBe('노쇼');
    expect(labelReservation('cancelled', null)).toBe('취소');
  });
});
