import { describe, expect, it } from 'vitest';

import { COUPON_VALID_DAYS, MIN_PAYMENT_AMOUNT } from '@/server/policy';

import {
  COUPON_NOT_APPLICABLE_NOTE,
  COUPON_SELECT_NOTES,
  couponOptionLabel,
  couponResetText,
  myCouponSummary,
} from './coupon-texts';

// 2027-02-07(일) 15:00 KST
const EXPIRES = '2027-02-07T06:00:00.000Z';

describe('쿠폰 문구', () => {
  it('쿠폰 하나는 할인 금액과 한국 시각 기한', () => {
    expect(couponOptionLabel({ amount: 3000, expiresAt: EXPIRES })).toBe(
      '3,000원 할인 · 2/7(일) 15:00까지',
    );
  });

  it('못 쓰는 쿠폰은 최소 결제 금액(정책값)을 알려 준다', () => {
    expect(COUPON_NOT_APPLICABLE_NOTE).toContain(
      `${MIN_PAYMENT_AMOUNT.toLocaleString('ko-KR')}원보다 작아져요`,
    );
  });

  it('쿠폰 고르는 곳에 1장·유효기간·취소하면 돌려주지 않음·원장님 사정이면 돌려줌을 늘 보여 준다(동의 문구 4장)', () => {
    const text = COUPON_SELECT_NOTES.join(' ');
    expect(text).toContain(`결제 1건에 1장만 쓸 수 있어요(받은 날부터 ${COUPON_VALID_DAYS}일)`);
    expect(text).toContain(
      '쿠폰을 쓴 예약을 취소하면 쿠폰은 돌려드리지 않고, 환불은 실제 결제한 금액 기준이에요.',
    );
    expect(text).toContain('원장님 사정으로 취소되면 쓴 쿠폰도 돌려드려요.');
  });

  it('쿠폰 실패 뒤에는 쓰지 않음으로 돌렸다고 알린다', () => {
    expect(couponResetText('이미 쓴 쿠폰이에요')).toBe(
      "이미 쓴 쿠폰이에요. 쿠폰을 '쓰지 않음'으로 바꿨어요. 금액을 확인해 주세요.",
    );
  });

  it('내 정보 쿠폰 줄은 개수와 가장 빠른 기한(첫 번째)', () => {
    expect(myCouponSummary([])).toBe('쓸 수 있는 쿠폰이 없어요.');
    expect(
      myCouponSummary([{ expiresAt: EXPIRES }, { expiresAt: '2027-03-01T06:00:00.000Z' }]),
    ).toBe('쿠폰 2장 · 가장 빠른 기한 2/7(일) 15:00');
  });
});
