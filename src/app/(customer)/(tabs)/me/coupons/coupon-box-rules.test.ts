import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COUPON_BOX_PATH,
  COUPON_SOON_DAYS,
  couponDaysLeft,
  couponLeftText,
} from './coupon-box-rules';

// 쿠폰함(#480) 남은 날 계산과 문구. 시각은 한국 시간(UTC+9) 기준이다
describe('couponDaysLeft', () => {
  // 한국 11/20(금) 10:00
  const now = new Date('2026-11-20T01:00:00.000Z');

  it('마지막으로 쓸 수 있는 날까지 남은 날을 한국 날짜로 센다', () => {
    // 한국 11/26(목) 15:00에 끝남 → 6일
    expect(couponDaysLeft('2026-11-26T06:00:00.000Z', now)).toBe(6);
    // 한국 2027-01-15(금) 10:00 → 56일
    expect(couponDaysLeft('2027-01-15T01:00:00.000Z', now)).toBe(56);
  });

  it('오늘 안에 끝나면 0', () => {
    // 한국 11/20 23:00
    expect(couponDaysLeft('2026-11-20T14:00:00.000Z', now)).toBe(0);
  });

  it('자정(한국 00:00)에 끝나면 그 전날이 마지막 날이다', () => {
    // 한국 11/21 00:00에 끝남 → 마지막 날은 11/20(오늘) → 0
    expect(couponDaysLeft('2026-11-20T15:00:00.000Z', now)).toBe(0);
    // 한국 11/21 00:01에 끝남 → 11/21까지 쓸 수 있음 → 1
    expect(couponDaysLeft('2026-11-20T15:01:00.000Z', now)).toBe(1);
  });

  it('UTC 날짜가 아니라 한국 날짜로 나눈다', () => {
    // 한국 11/21 00:30(UTC로는 아직 11/20). 한국 11/21 20:00에 끝나면 오늘 → 0
    const justAfterMidnight = new Date('2026-11-20T15:30:00.000Z');
    expect(couponDaysLeft('2026-11-21T11:00:00.000Z', justAfterMidnight)).toBe(0);
  });
});

describe('couponLeftText', () => {
  it(`${COUPON_SOON_DAYS}일 이하이면 강조하고, 넘으면 강조하지 않는다`, () => {
    expect(couponLeftText(COUPON_SOON_DAYS)).toEqual({
      text: `${COUPON_SOON_DAYS}일 남음`,
      soon: true,
    });
    expect(couponLeftText(COUPON_SOON_DAYS + 1)).toEqual({
      text: `${COUPON_SOON_DAYS + 1}일 남음`,
      soon: false,
    });
  });

  it('마지막 날이면 "오늘까지"(강조)', () => {
    expect(couponLeftText(0)).toEqual({ text: '오늘까지', soon: true });
  });
});

describe('쿠폰함 주소', () => {
  it('내 정보 쿠폰 줄이 여는 주소(/me/coupons)에 화면이 있다', () => {
    expect(COUPON_BOX_PATH).toBe('/me/coupons');
    const page = path.join(process.cwd(), 'src/app/(customer)/(tabs)', COUPON_BOX_PATH, 'page.tsx');
    expect(existsSync(page)).toBe(true);
  });
});
