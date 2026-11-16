import { describe, expect, it } from 'vitest';

import { NOTIFICATION_TEXTS, notificationHref, notificationTimeText } from './notification-rules';

// 알림함 시각 문구와 누르면 갈 주소(#371). 시각은 한국 시간(UTC+9) 기준이다
describe('notificationTimeText', () => {
  // 한국 시간 11/15(일) 12:00
  const now = '2026-11-15T03:00:00.000Z';

  it('1분 안이면 "방금", 1시간 안이면 "N분 전", 24시간 안이면 "N시간 전"', () => {
    expect(notificationTimeText('2026-11-15T02:59:30.000Z', now)).toBe('방금');
    expect(notificationTimeText('2026-11-15T02:59:00.000Z', now)).toBe('1분 전');
    expect(notificationTimeText('2026-11-15T02:01:00.000Z', now)).toBe('59분 전');
    expect(notificationTimeText('2026-11-15T02:00:00.000Z', now)).toBe('1시간 전');
    expect(notificationTimeText('2026-11-14T03:01:00.000Z', now)).toBe('23시간 전');
  });

  it('서버 시각보다 늦게 찍힌 알림(시계 차이)은 "방금"', () => {
    expect(notificationTimeText('2026-11-15T03:05:00.000Z', now)).toBe('방금');
  });

  it('24시간이 지났고 한국 날짜로 어제면 "어제", 그보다 전이면 날짜', () => {
    // 한국 11/14 11:00 (25시간 전)
    expect(notificationTimeText('2026-11-14T02:00:00.000Z', now)).toBe('어제');
    // 한국 11/14 00:00 (어제의 첫 순간)
    expect(notificationTimeText('2026-11-13T15:00:00.000Z', now)).toBe('어제');
    // 한국 11/13 23:59
    expect(notificationTimeText('2026-11-13T14:59:00.000Z', now)).toBe('11월 13일');
    expect(notificationTimeText('2026-08-17T03:00:00.000Z', now)).toBe('8월 17일');
  });

  it('어제·오늘은 UTC가 아니라 한국 날짜로 나눈다', () => {
    // 한국 11/15 00:30 (UTC로는 아직 11/14)
    const justAfterMidnight = '2026-11-14T15:30:00.000Z';
    // 한국 11/14 00:10 → 24시간 20분 전, 한국 날짜로 어제
    expect(notificationTimeText('2026-11-13T15:10:00.000Z', justAfterMidnight)).toBe('어제');
    // 한국 11/13 23:50 → 그제
    expect(notificationTimeText('2026-11-13T14:50:00.000Z', justAfterMidnight)).toBe('11월 13일');
  });

  it('지난해 알림은 연도를 붙인다', () => {
    // 한국 2026-01-01 00:00 기준, 한국 2025-12-30 09:00
    expect(notificationTimeText('2025-12-30T00:00:00.000Z', '2025-12-31T15:00:00.000Z')).toBe(
      '2025년 12월 30일',
    );
  });
});

describe('notificationHref', () => {
  it('투리 안 주소는 그대로 간다', () => {
    expect(notificationHref('/reservations/abc')).toBe('/reservations/abc');
    expect(notificationHref('/reservations?tab=cancelled')).toBe('/reservations?tab=cancelled');
  });

  it('다른 사이트로 가는 주소와 빈 주소는 이동하지 않는다(null)', () => {
    expect(notificationHref('https://evil.example/x')).toBeNull();
    expect(notificationHref('//evil.example/x')).toBeNull();
    expect(notificationHref('/\\evil.example')).toBeNull();
    expect(notificationHref('javascript:alert(1)')).toBeNull();
    expect(notificationHref('')).toBeNull();
  });
});

describe('알림함 문구', () => {
  it('빈 알림함 문구의 기간은 정책 값(90일)이다', () => {
    expect(NOTIFICATION_TEXTS.EMPTY).toBe('최근 90일 동안 받은 알림이 없어요');
  });
});
