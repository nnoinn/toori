// 운영자 조회 화면이 같이 쓰는 검색·목록·표시 모양 (W18). 검색어 다듬기, 검색 패턴, 목록 자르기, 예약 상태 이름을 본다.

import { describe, expect, it } from 'vitest';

import {
  ADMIN_LIST_LIMIT,
  ADMIN_PAGE_SIZE,
  containsPattern,
  labelReservation,
  toListResult,
  toPage,
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

  it('쪽 나누기: 한 쪽 20줄, 쪽 수보다 큰 쪽은 마지막 쪽, 기록이 없으면 1쪽(기술 가이드 7장)', () => {
    expect(ADMIN_PAGE_SIZE).toBe(20);
    expect(toPage(45, 1)).toEqual({ page: 1, pageCount: 3, offset: 0 });
    expect(toPage(45, 3)).toEqual({ page: 3, pageCount: 3, offset: 40 });
    expect(toPage(40, 3)).toEqual({ page: 2, pageCount: 2, offset: 20 });
    expect(toPage(45, 99)).toEqual({ page: 3, pageCount: 3, offset: 40 });
    expect(toPage(0, 5)).toEqual({ page: 1, pageCount: 1, offset: 0 });
    expect(toPage(45, 0)).toEqual({ page: 1, pageCount: 3, offset: 0 });
  });

  it('예약 상태 이름. 노쇼는 이용 완료보다 먼저 본다', () => {
    expect(labelReservation('confirmed', null)).toBe('예정');
    expect(labelReservation('completed', 'visited')).toBe('이용 완료');
    expect(labelReservation('completed', 'no_show')).toBe('노쇼');
    expect(labelReservation('cancelled', null)).toBe('취소');
  });
});
