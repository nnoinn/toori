import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TAB,
  isVisitPending,
  parseTab,
  RESERVATION_TABS,
  statusOfTab,
  tabHref,
} from './reservation-tabs';

describe('내 예약 탭', () => {
  it('예정 / 이용 완료 / 취소 순서, 기본은 예정', () => {
    expect(RESERVATION_TABS.map((tab) => tab.label)).toEqual(['예정', '이용 완료', '취소']);
    expect(DEFAULT_TAB).toBe('upcoming');
  });

  it('탭마다 예약 상태 하나', () => {
    expect(statusOfTab('upcoming')).toBe('confirmed');
    expect(statusOfTab('completed')).toBe('completed');
    expect(statusOfTab('cancelled')).toBe('cancelled');
  });

  it('주소의 tab 값을 읽고, 목록에 없으면 예정', () => {
    expect(parseTab('cancelled')).toBe('cancelled');
    expect(parseTab(['completed', 'cancelled'])).toBe('completed');
    expect(parseTab('noshow')).toBe('upcoming');
    expect(parseTab(undefined)).toBe('upcoming');
  });

  it('기본 탭은 주소를 짧게', () => {
    expect(tabHref('upcoming')).toBe('/reservations');
    expect(tabHref('cancelled')).toBe('/reservations?tab=cancelled');
  });
});

describe('방문 확인 중', () => {
  const now = new Date('2026-10-27T10:00:00+09:00');

  it('시작 시각이 지났거나 딱 시작 시각인 예정 예약', () => {
    expect(isVisitPending('confirmed', '2026-10-27T09:00:00+09:00', now)).toBe(true);
    expect(isVisitPending('confirmed', '2026-10-27T10:00:00+09:00', now)).toBe(true);
  });

  it('아직 시작 전이면 아니다', () => {
    expect(isVisitPending('confirmed', '2026-10-27T10:00:01+09:00', now)).toBe(false);
  });

  it('이용 완료·취소 예약은 시간이 지나도 아니다', () => {
    expect(isVisitPending('completed', '2026-10-27T09:00:00+09:00', now)).toBe(false);
    expect(isVisitPending('cancelled', '2026-10-27T09:00:00+09:00', now)).toBe(false);
  });
});
