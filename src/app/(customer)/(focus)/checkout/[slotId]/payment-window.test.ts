import { describe, expect, it } from 'vitest';

import type { PaymentRequest } from '@/server/payments/types';

import { CHECKOUT_PAY_METHOD, paymentResultPath, toPortOneRequest } from './payment-window';

const request: PaymentRequest = {
  storeId: 'store-test',
  channelKey: 'channel-key-test',
  paymentId: 'toori-0f8c7e2a-1b3d-4c5e-8f90-123456789abc',
  orderName: '샘플 헤어 커트',
  totalAmount: 17500,
  currency: 'CURRENCY_KRW',
  redirectUrl: 'http://localhost:3000/payment/result',
};

describe('포트원 결제창 요청값 (C-403)', () => {
  it('서버가 준 값은 그대로 두고 결제 수단만 더한다', () => {
    expect(toPortOneRequest(request)).toEqual({ ...request, payMethod: 'CARD' });
    expect(CHECKOUT_PAY_METHOD).toBe('CARD');
  });

  it('결제 번호는 토스페이먼츠 규칙(영문·숫자·-·_, 6~64자)에 맞는 모양이다', () => {
    expect(request.paymentId).toMatch(/^[A-Za-z0-9_-]{6,64}$/);
  });
});

describe('결제창이 닫힌 뒤 결과 화면 주소', () => {
  it('결제했으면 결제 번호만 붙인다', () => {
    expect(paymentResultPath(request.redirectUrl, { paymentId: request.paymentId })).toBe(
      `/payment/result?paymentId=${request.paymentId}`,
    );
  });

  it('닫았거나 실패했으면 code·message도 붙인다', () => {
    const path = paymentResultPath(request.redirectUrl, {
      paymentId: request.paymentId,
      code: 'FAILURE_TYPE_PG',
      message: '결제를 취소했어요 & 다시',
    });
    const url = new URL(path, 'http://localhost');
    expect(url.pathname).toBe('/payment/result');
    expect(url.searchParams.get('paymentId')).toBe(request.paymentId);
    expect(url.searchParams.get('code')).toBe('FAILURE_TYPE_PG');
    expect(url.searchParams.get('message')).toBe('결제를 취소했어요 & 다시');
  });

  it('다른 주소(origin)로 나가지 않고 앱 안의 경로만 돌려준다', () => {
    expect(
      paymentResultPath('https://toori.example/payment/result', { paymentId: 'toori-abcdef' }),
    ).toBe('/payment/result?paymentId=toori-abcdef');
  });
});
