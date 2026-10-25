import { describe, expect, it } from 'vitest';

import { DEFAULT_TAB, parseTab, RESERVATION_TABS, statusOfTab, tabHref } from './reservation-tabs';

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
