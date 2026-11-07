import { describe, expect, it } from 'vitest';

import { clampSheetHeight, SHEET_FLICK_SPEED, snapSheet } from './sheet-drag';

// 폰 화면 높이 700px 기준: 반 = 350, 전체 = 700, 가운데 = 525
const HALF = 350;
const FULL = 700;

describe('목록 시트 끄는 높이', () => {
  it('반과 전체 사이에서만 움직인다', () => {
    expect(clampSheetHeight(500, HALF, FULL)).toBe(500);
    expect(clampSheetHeight(200, HALF, FULL)).toBe(HALF);
    expect(clampSheetHeight(900, HALF, FULL)).toBe(FULL);
  });
});

describe('놓았을 때 붙을 곳', () => {
  it('천천히 놓으면 반과 전체의 가운데를 넘었는지로 정한다', () => {
    expect(snapSheet({ height: 524, half: HALF, full: FULL, velocity: 0 })).toBe('half');
    expect(snapSheet({ height: 525, half: HALF, full: FULL, velocity: 0 })).toBe('full');
    expect(snapSheet({ height: 690, half: HALF, full: FULL, velocity: 0.2 })).toBe('full');
  });

  it('빠르게 위로 튕기면 조금만 올려도 전체', () => {
    expect(snapSheet({ height: 380, half: HALF, full: FULL, velocity: -SHEET_FLICK_SPEED })).toBe(
      'full',
    );
  });

  it('빠르게 아래로 튕기면 조금만 내려도 반', () => {
    expect(snapSheet({ height: 660, half: HALF, full: FULL, velocity: SHEET_FLICK_SPEED })).toBe(
      'half',
    );
  });
});
