import { describe, expect, it } from 'vitest';

import { showsNoShow, VOID_BADGE, voidedNote } from './void-texts';

// 예약 무효(A-108) 손님 화면 표시. 기댓값 출처: #528 제안 2·3번(11/21 정찬형), 무효 손님 알림 문구(#423, 11/17 nnoinn "사용하신")
describe('예약 무효 안내', () => {
  it('이름표는 "무효"', () => {
    expect(VOID_BADGE).toBe('무효');
  });

  it('결제한 금액이 있으면 모두 돌려줬다고 알린다', () => {
    expect(voidedNote({ amount: 42000, couponAmount: 0 })).toBe(
      '이 예약은 무효로 처리됐어요. 결제하신 금액을 모두 돌려드렸어요.',
    );
  });

  it('쿠폰을 썼으면 쿠폰도 돌려줬다고 붙인다', () => {
    expect(voidedNote({ amount: 39000, couponAmount: 3000 })).toBe(
      '이 예약은 무효로 처리됐어요. 결제하신 금액을 모두 돌려드렸어요. 사용하신 쿠폰도 돌려드렸어요.',
    );
  });

  it('쿠폰으로 0원 결제했으면 금액은 말하지 않고 쿠폰만', () => {
    expect(voidedNote({ amount: 0, couponAmount: 3000 })).toBe(
      '이 예약은 무효로 처리됐어요. 사용하신 쿠폰을 돌려드렸어요.',
    );
  });

  it('원장님 요청이라는 말은 넣지 않는다', () => {
    expect(voidedNote({ amount: 39000, couponAmount: 3000 })).not.toContain('원장님');
  });
});

describe('무효 예약의 노쇼 표시', () => {
  it('노쇼였어도 무효면 노쇼 표시를 숨긴다(결제액을 모두 돌려받았다)', () => {
    expect(showsNoShow({ noShow: true, voided: true })).toBe(false);
  });

  it('무효가 아니면 노쇼 표시는 그대로', () => {
    expect(showsNoShow({ noShow: true, voided: false })).toBe(true);
    expect(showsNoShow({ noShow: false, voided: false })).toBe(false);
  });
});
