import { describe, expect, it } from 'vitest';

import { AUTO_CANCEL_ERRORS, PAYMENT_ERRORS } from '@/server/payments/errors';

import { failureAction } from './result-rules';

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
      }).href,
    ).toBe(`/slots/${SLOT}`);
  });

  it('자동 취소(환불)했거나 결제 정보를 못 찾으면 홈', () => {
    expect(
      failureAction({
        code: 'SLOT_SOLD',
        message: AUTO_CANCEL_ERRORS.SLOT_SOLD,
        autoCancelled: true,
      }).href,
    ).toBe('/');
    expect(
      failureAction({ code: 'PAYMENT_NOT_FOUND', message: PAYMENT_ERRORS.PAYMENT_NOT_FOUND }).href,
    ).toBe('/');
  });
});
