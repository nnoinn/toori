// 결제 번호 (W11 ①). 포트원 규칙(영문·숫자·-·_, 6~64자)에 맞고 매번 다른지 본다. 주문 저장은 order-store.db.test.ts가 본다.

import { describe, expect, it } from 'vitest';

import { newPaymentId } from './order-store';

describe('newPaymentId', () => {
  it('포트원 규칙에 맞고 매번 다르다', () => {
    const ids = Array.from({ length: 50 }, newPaymentId);
    for (const id of ids) expect(id).toMatch(/^toori-[A-Za-z0-9_-]{6,58}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
