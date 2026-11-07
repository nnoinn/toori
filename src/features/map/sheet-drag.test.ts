import { describe, expect, it } from 'vitest';

import { clampSheetHeight, nextSheetOnTap, SHEET_FLICK_SPEED, snapSheet } from './sheet-drag';

// 폰 화면 높이 700px 기준: 내림(손잡이만) = 60, 반 = 350, 전체 = 700
const POINTS = { min: 60, half: 350, full: 700 };

describe('목록 시트 끄는 높이', () => {
  it('내림과 전체 사이에서만 움직인다', () => {
    expect(clampSheetHeight(500, POINTS)).toBe(500);
    expect(clampSheetHeight(20, POINTS)).toBe(60);
    expect(clampSheetHeight(900, POINTS)).toBe(700);
  });
});

describe('놓았을 때 붙을 곳', () => {
  it('천천히 놓으면 가장 가까운 단계', () => {
    expect(snapSheet({ height: 100, points: POINTS, velocity: 0 })).toBe('min');
    expect(snapSheet({ height: 300, points: POINTS, velocity: 0 })).toBe('half');
    expect(snapSheet({ height: 524, points: POINTS, velocity: 0 })).toBe('half');
    expect(snapSheet({ height: 526, points: POINTS, velocity: 0.2 })).toBe('full');
  });

  it('빠르게 위로 튕기면 지금보다 큰 다음 단계', () => {
    const up = -SHEET_FLICK_SPEED;
    expect(snapSheet({ height: 90, points: POINTS, velocity: up })).toBe('half');
    expect(snapSheet({ height: 380, points: POINTS, velocity: up })).toBe('full');
    expect(snapSheet({ height: 700, points: POINTS, velocity: up })).toBe('full');
  });

  it('빠르게 아래로 튕기면 지금보다 작은 다음 단계', () => {
    const down = SHEET_FLICK_SPEED;
    expect(snapSheet({ height: 660, points: POINTS, velocity: down })).toBe('half');
    expect(snapSheet({ height: 320, points: POINTS, velocity: down })).toBe('min');
    expect(snapSheet({ height: 60, points: POINTS, velocity: down })).toBe('min');
  });
});

describe('손잡이 누르기', () => {
  it('내림 → 반, 반 → 전체, 전체 → 반', () => {
    expect(nextSheetOnTap('min')).toBe('half');
    expect(nextSheetOnTap('half')).toBe('full');
    expect(nextSheetOnTap('full')).toBe('half');
  });
});
