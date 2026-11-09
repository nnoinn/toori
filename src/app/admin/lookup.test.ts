// 운영자 조회 화면이 같이 쓰는 검색·목록·표시 모양 (W18). 검색어 다듬기, 검색 패턴, 목록 자르기, 예약 상태 이름을 본다.

import { describe, expect, it } from 'vitest';

import {
  ADMIN_LIST_LIMIT,
  containsPattern,
  labelReservation,
  toListResult,
  toSearchQuery,
} from './lookup';

describe('운영자 조회 공통 모양', () => {
  it('검색어는 앞뒤 공백을 지우고 50자까지만', () => {
    expect(toSearchQuery('  김  ')).toBe('김');
    expect(toSearchQuery(undefined)).toBe('');
    expect(toSearchQuery('가'.repeat(60))).toHaveLength(50);
  });

  it('검색 패턴은 % _ \\ 를 글자 그대로 찾는다', () => {
    expect(containsPattern('샘플')).toBe('%샘플%');
    expect(containsPattern('10%_a\\b')).toBe('%10\\%\\_a\\\\b%');
  });

  it('목록은 최대 줄 수까지 자르고 더 있는지 알려 준다', () => {
    const rows = Array.from({ length: ADMIN_LIST_LIMIT + 1 }, (_, i) => i);
    expect(toListResult(rows)).toEqual({ rows: rows.slice(0, ADMIN_LIST_LIMIT), hasMore: true });
    expect(toListResult([1, 2])).toEqual({ rows: [1, 2], hasMore: false });
  });

  it('예약 상태 이름. 노쇼는 이용 완료보다 먼저 본다', () => {
    expect(labelReservation('confirmed', null)).toBe('예정');
    expect(labelReservation('completed', 'visited')).toBe('이용 완료');
    expect(labelReservation('completed', 'no_show')).toBe('노쇼');
    expect(labelReservation('cancelled', null)).toBe('취소');
  });
});
