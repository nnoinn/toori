import { describe, expect, it } from 'vitest';

import { unreadBadgeText } from './notification-bell';

// 종 옆 안 읽은 수(#371, 함수 모양 제안 "100개 이상은 99+")
describe('unreadBadgeText', () => {
  it('안 읽은 알림이 없으면 숫자를 보여주지 않는다', () => {
    expect(unreadBadgeText(0)).toBeNull();
    expect(unreadBadgeText(-1)).toBeNull();
  });

  it('99개까지는 그 수, 100개부터는 "99+"', () => {
    expect(unreadBadgeText(1)).toBe('1');
    expect(unreadBadgeText(99)).toBe('99');
    expect(unreadBadgeText(100)).toBe('99+');
    expect(unreadBadgeText(1234)).toBe('99+');
  });
});
