import { describe, expect, it } from 'vitest';

import { AUTO_CANCEL_ERRORS, PAYMENT_ERRORS, UNCONFIRMED_ERRORS } from '@/server/payments/errors';

import { canRecheck, CONFIRM_FAILED, failureAction } from './result-rules';

const SLOT = '11111111-1111-4111-8111-111111111111';

describe('결제 실패 뒤 다음 행동 (C-406, D12)', () => {
  it('결제창을 닫았고 홀딩이 남았으면 예약 확인으로 돌아간다', () => {
    expect(
      failureAction({
        code: 'PAYMENT_CANCELLED',
        message: PAYMENT_ERRORS.PAYMENT_CANCELLED,
        slotId: SLOT,
        holdActive: true,
      }),
    ).toEqual({ label: '예약 확인으로 돌아가기', href: `/checkout/${SLOT}` });
  });

  it('홀딩이 끝났으면 매물 상세로', () => {
    expect(
      failureAction({
        code: 'PAYMENT_FAILED',
        message: PAYMENT_ERRORS.PAYMENT_FAILED,
        slotId: SLOT,
        holdActive: false,
      }),
    ).toEqual({ label: '매물 다시 보기', href: `/slots/${SLOT}` });
  });

  it('자동 취소(환불)했거나 결제 정보를 못 찾으면 고객 홈', () => {
    expect(
      failureAction({
        code: 'SLOT_SOLD',
        message: AUTO_CANCEL_ERRORS.SLOT_SOLD,
        autoCancelled: true,
      }),
    ).toEqual({ label: '홈으로', href: '/home' });
    expect(
      failureAction({ code: 'PAYMENT_NOT_FOUND', message: PAYMENT_ERRORS.PAYMENT_NOT_FOUND }),
    ).toEqual({ label: '홈으로', href: '/home' });
  });

  it('매물을 모르는 결제 취소·실패는 고객 홈(빈 매물 주소로 보내지 않는다)', () => {
    expect(
      failureAction({ code: 'PAYMENT_CANCELLED', message: PAYMENT_ERRORS.PAYMENT_CANCELLED }),
    ).toEqual({ label: '홈으로', href: '/home' });
  });

  it('예약을 확정하지 못했고 결제 취소를 기다리는 중이면 매물이 있어도 고객 홈(곧 모두 환불)', () => {
    expect(
      failureAction({
        code: 'HOLD_EXPIRED',
        message: UNCONFIRMED_ERRORS.HOLD_EXPIRED,
        autoCancelled: false,
        slotId: SLOT,
      }),
    ).toEqual({ label: '홈으로', href: '/home' });
  });
});

describe("결제 결과를 아직 모를 때 '다시 확인' (#155)", () => {
  it('결제사가 처리 중이거나 포트원에 묻지 못했거나 요청이 닿지 않았으면 다시 확인한다', () => {
    expect(canRecheck({ code: 'PAYMENT_PENDING', message: PAYMENT_ERRORS.PAYMENT_PENDING })).toBe(
      true,
    );
    expect(
      canRecheck({
        code: 'PAYMENT_CHECK_UNAVAILABLE',
        message: PAYMENT_ERRORS.PAYMENT_CHECK_UNAVAILABLE,
      }),
    ).toBe(true);
    expect(canRecheck(CONFIRM_FAILED)).toBe(true);
  });

  it('결과가 정해진 실패는 다시 확인하지 않는다', () => {
    expect(
      canRecheck({
        code: 'PAYMENT_CANCELLED',
        message: PAYMENT_ERRORS.PAYMENT_CANCELLED,
        slotId: SLOT,
        holdActive: true,
      }),
    ).toBe(false);
    expect(
      canRecheck({ code: 'PAYMENT_NOT_FOUND', message: PAYMENT_ERRORS.PAYMENT_NOT_FOUND }),
    ).toBe(false);
    expect(
      canRecheck({
        code: 'HOLD_EXPIRED',
        message: UNCONFIRMED_ERRORS.HOLD_EXPIRED,
        autoCancelled: false,
      }),
    ).toBe(false);
  });
});
