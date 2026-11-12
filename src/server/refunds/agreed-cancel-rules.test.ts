// 합의 후 취소 계산·규칙 (X-208, 11/8 결정). 손님 환불(결제액 × 50%)과 원장님 기준 금액(판매가 × 50%), 요청할 수 있는 예약을 본다.

import { describe, expect, it } from 'vitest';

import { AGREED_CANCEL_REFUND_RATE } from '@/server/policy/refund';

import {
  calcAgreedCancel,
  currentRequestStatus,
  isAgreedCancelTarget,
  respondBlockReason,
} from './agreed-cancel-rules';

describe('calcAgreedCancel', () => {
  it('환불율은 50%이고, 쿠폰이 없으면 손님 환불과 원장님 기준 금액이 같다', () => {
    expect(AGREED_CANCEL_REFUND_RATE).toBe(50);
    expect(calcAgreedCancel({ paidAmount: 23_450, salePrice: 23_450 })).toEqual({
      refundAmount: 11_725,
      baseAmount: 11_725,
    });
  });

  it('쿠폰을 썼으면 손님 환불은 실제 결제액 기준, 원장님 기준 금액은 판매가 기준(쿠폰은 돌려주지 않는다)', () => {
    expect(calcAgreedCancel({ paidAmount: 20_450, salePrice: 23_450 })).toEqual({
      refundAmount: 10_225,
      baseAmount: 11_725,
    });
  });

  it('원 미만은 버린다', () => {
    expect(calcAgreedCancel({ paidAmount: 14_005, salePrice: 14_005 })).toEqual({
      refundAmount: 7002,
      baseAmount: 7002,
    });
  });

  it('금액이 정수가 아니거나 음수면 멈춘다', () => {
    expect(() => calcAgreedCancel({ paidAmount: -1, salePrice: 100 })).toThrow(RangeError);
    expect(() => calcAgreedCancel({ paidAmount: 100, salePrice: 1.5 })).toThrow(RangeError);
  });
});

describe('isAgreedCancelTarget', () => {
  it('예정 예약이고 방문·노쇼 처리 전일 때만', () => {
    expect(isAgreedCancelTarget({ status: 'confirmed', visitResult: null })).toBe(true);
    expect(isAgreedCancelTarget({ status: 'cancelled', visitResult: null })).toBe(false);
    expect(isAgreedCancelTarget({ status: 'completed', visitResult: 'visited' })).toBe(false);
    expect(isAgreedCancelTarget({ status: 'completed', visitResult: 'no_show' })).toBe(false);
  });
});

describe('currentRequestStatus·respondBlockReason', () => {
  const NOW = new Date('2026-11-12T03:00:00.000Z');
  const confirmed = { status: 'confirmed' as const, visitResult: null };
  const requested = (expiresAt: Date) => ({ status: 'requested' as const, expiresAt });
  const later = new Date(NOW.getTime() + 1000);

  it('답 기다림이어도 만료 시각이 지났으면 expired, 예약이 바뀌었으면 closed', () => {
    expect(currentRequestStatus(requested(later), confirmed, NOW)).toBe('requested');
    expect(currentRequestStatus(requested(NOW), confirmed, NOW)).toBe('expired');
    expect(
      currentRequestStatus(requested(later), { status: 'cancelled', visitResult: null }, NOW),
    ).toBe('closed');
    expect(currentRequestStatus({ status: 'declined', expiresAt: later }, confirmed, NOW)).toBe(
      'declined',
    );
  });

  it('답할 수 없는 이유', () => {
    expect(respondBlockReason('requested')).toBeNull();
    expect(respondBlockReason('expired')).toBe('REQUEST_EXPIRED');
    expect(respondBlockReason('agreed')).toBe('ALREADY_RESPONDED');
    expect(respondBlockReason('declined')).toBe('ALREADY_RESPONDED');
    expect(respondBlockReason('closed')).toBe('RESERVATION_CHANGED');
  });
});
