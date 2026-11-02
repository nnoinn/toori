import { describe, expect, it } from 'vitest';

import { type DigitInputRule, editDigitInput, formatDigitInput } from './digit-input';

// 하이픈 없이 숫자만 6자리까지(계좌번호처럼). 하이픈 있는 양식은 phone.test.ts·business-number.test.ts에서 본다
const SIX_DIGITS: DigitInputRule = { format: (digits) => digits, maxDigits: () => 6 };
// 2-나머지로 하이픈을 넣고 5자리까지
const TWO_THREE: DigitInputRule = {
  format: (digits) => (digits.length <= 2 ? digits : `${digits.slice(0, 2)}-${digits.slice(2)}`),
  maxDigits: () => 5,
};

// 브라우저가 바꾼 값(raw)과 커서 위치를 '|'로 적는다
const edit = (rule: DigitInputRule, prev: string, rawWithCaret: string, deleteForward = false) => {
  const caret = rawWithCaret.indexOf('|');
  const raw = rawWithCaret.replace('|', '');
  const next = editDigitInput(rule, prev, raw, caret, deleteForward);
  return `${next.value.slice(0, next.caret)}|${next.value.slice(next.caret)}`;
};

describe('formatDigitInput', () => {
  it('숫자만 남기고 자릿수까지 자른 뒤 모양을 맞춘다', () => {
    expect(formatDigitInput(SIX_DIGITS, '12-34 56 78')).toBe('123456');
    expect(formatDigitInput(TWO_THREE, '12a345')).toBe('12-345');
    expect(formatDigitInput(TWO_THREE, '')).toBe('');
  });
});

describe('editDigitInput (번호 입력칸 글자가 바뀔 때, #205)', () => {
  it('숫자가 아닌 글자는 받지 않고 커서는 제자리', () => {
    expect(edit(SIX_DIGITS, '123', '12a|3')).toBe('12|3');
    expect(edit(SIX_DIGITS, '123', '123-|')).toBe('123|');
  });

  it('자릿수를 다 친 뒤에는 더 받지 않는다', () => {
    expect(edit(SIX_DIGITS, '123456', '1234567|')).toBe('123456|');
    expect(edit(SIX_DIGITS, '123456', '19|23456')).toBe('1|23456');
  });

  it('붙여 넣은 긴 번호는 자릿수까지 자른다', () => {
    expect(edit(SIX_DIGITS, '', '1234-5678-90|')).toBe('123456|');
  });

  it('하이픈 바로 뒤에서 지우기·바로 앞에서 Delete를 누르면 옆 숫자가 지워진다', () => {
    expect(edit(TWO_THREE, '12-345', '12|345')).toBe('1|3-45');
    expect(edit(TWO_THREE, '12-345', '12|345', true)).toBe('12|-45');
  });
});
