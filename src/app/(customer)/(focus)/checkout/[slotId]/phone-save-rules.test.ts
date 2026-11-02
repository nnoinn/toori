import { describe, expect, it } from 'vitest';

import { isPhoneReady, phoneSubmit } from './phone-save-rules';

const A = '010-1234-5678';
const B = '010-9876-5432';

describe('연락처 자동 저장: 다 쳤거나 칸을 벗어났을 때 (#183)', () => {
  it('저장된 번호와 다른 맞는 번호면 저장한다', () => {
    expect(phoneSubmit(B, A, null)).toEqual({ kind: 'save', phone: B });
    expect(phoneSubmit(A, null, null)).toEqual({ kind: 'save', phone: A });
    // 011의 10자리 번호(칸을 벗어날 때)
    expect(phoneSubmit('011-123-4567', null, null)).toEqual({
      kind: 'save',
      phone: '011-123-4567',
    });
  });

  it('저장된 번호와 같으면 다시 저장하지 않는다', () => {
    expect(phoneSubmit(A, A, null)).toEqual({ kind: 'none' });
  });

  it('틀린 번호면 저장하지 않고 틀렸다고 알린다', () => {
    expect(phoneSubmit('010-1234-567', A, null)).toEqual({ kind: 'invalid' });
    expect(phoneSubmit('012-3456-7890', null, null)).toEqual({ kind: 'invalid' });
  });

  it('빈 칸은 그대로 둔다', () => {
    expect(phoneSubmit('', A, null)).toEqual({ kind: 'none' });
  });

  it('저장 중이면 저장 중인 번호와 비교한다', () => {
    // B를 저장하는 중에 다시 B: 또 저장하지 않는다
    expect(phoneSubmit(B, A, B)).toEqual({ kind: 'none' });
    // B를 저장하는 중에 원래 번호 A로 되돌림: A를 다시 저장해야 마지막 입력(A)이 남는다
    expect(phoneSubmit(A, A, B)).toEqual({ kind: 'save', phone: A });
  });
});

describe('연락처가 결제할 수 있는 상태인지 (#183)', () => {
  it('저장이 끝났고 칸의 번호가 저장된 번호와 같을 때만', () => {
    expect(isPhoneReady(A, A, null)).toBe(true);
  });

  it('저장 중이면 잠근다', () => {
    expect(isPhoneReady(A, A, A)).toBe(false);
    expect(isPhoneReady(B, A, B)).toBe(false);
  });

  it('번호를 고치는 중이거나 지웠으면 잠근다(예전 번호로 결제되지 않게)', () => {
    expect(isPhoneReady('010-1234-567', A, null)).toBe(false);
    expect(isPhoneReady(B, A, null)).toBe(false);
    expect(isPhoneReady('', A, null)).toBe(false);
  });

  it('저장된 번호가 없거나 저장에 실패했으면 잠근다', () => {
    expect(isPhoneReady(A, null, null)).toBe(false);
  });
});
