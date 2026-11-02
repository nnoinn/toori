import { describe, expect, it } from 'vitest';

import {
  BUSINESS_NUMBER_INPUT,
  businessNumberCheckDigit,
  formatBusinessNumber,
  isValidBusinessNumber,
} from './business-number';
import { editDigitInput, formatDigitInput } from './digit-input';

// 시험용 가짜 번호 만들기: 아무 숫자 9자리 + businessNumberCheckDigit(그 9자리).
// 예: '123456789' + 1 → 123-45-67891, '220812345' + 5 → 220-81-23455
const fakeNumber = (first9: string) => `${first9}${businessNumberCheckDigit(first9)}`;

describe('사업자등록번호 검증번호 (#205)', () => {
  it('검증번호를 국세청 규칙대로 계산한다', () => {
    expect(businessNumberCheckDigit('123456789')).toBe(1);
    // 2·1 + 2·3 + 0·7 + 8·1 + 1·3 + 2·7 + 3·1 + 4·3 + 5·5 = 73, 5·5 = 25의 십의 자리 2를 더해 75 → 10 − 5 = 5
    expect(businessNumberCheckDigit('220812345')).toBe(5);
    // 합의 일의 자리가 0이면 검증번호도 0
    expect(businessNumberCheckDigit('000000000')).toBe(0);
  });

  it('검증번호가 맞으면 통과하고, 하이픈·공백은 있어도 된다', () => {
    expect(isValidBusinessNumber('1234567891')).toBe(true);
    expect(isValidBusinessNumber('123-45-67891')).toBe(true);
    expect(isValidBusinessNumber(' 220 81 23455 ')).toBe(true);
    expect(isValidBusinessNumber(fakeNumber('987654321'))).toBe(true);
  });

  it('마지막 자리가 틀리거나 10자리가 아니면 막는다', () => {
    expect(isValidBusinessNumber('1234567890')).toBe(false);
    expect(isValidBusinessNumber('123-45-67892')).toBe(false);
    expect(isValidBusinessNumber('123456789')).toBe(false);
    expect(isValidBusinessNumber('12345678911')).toBe(false);
    expect(isValidBusinessNumber('123-45-6789a')).toBe(false);
    expect(isValidBusinessNumber('')).toBe(false);
  });
});

describe('사업자등록번호 모양', () => {
  it('저장한 숫자 10자리를 123-45-67890 모양으로', () => {
    expect(formatBusinessNumber('1234567891')).toBe('123-45-67891');
    expect(formatBusinessNumber('12345')).toBe('12345');
  });

  it('치는 동안 3-2-5로 하이픈을 넣고 10자리까지만', () => {
    expect(formatDigitInput(BUSINESS_NUMBER_INPUT, '123')).toBe('123');
    expect(formatDigitInput(BUSINESS_NUMBER_INPUT, '1234')).toBe('123-4');
    expect(formatDigitInput(BUSINESS_NUMBER_INPUT, '12345')).toBe('123-45');
    expect(formatDigitInput(BUSINESS_NUMBER_INPUT, '123456')).toBe('123-45-6');
    expect(formatDigitInput(BUSINESS_NUMBER_INPUT, '1234567891')).toBe('123-45-67891');
    expect(formatDigitInput(BUSINESS_NUMBER_INPUT, '123-45-678912345')).toBe('123-45-67891');
  });

  it('입력칸: 하이픈 바로 뒤에서 지우면 앞 숫자가 지워지고, 10자리 뒤에는 더 받지 않는다', () => {
    const edit = (prev: string, rawWithCaret: string) => {
      const caret = rawWithCaret.indexOf('|');
      const raw = rawWithCaret.replace('|', '');
      const next = editDigitInput(BUSINESS_NUMBER_INPUT, prev, raw, caret);
      return `${next.value.slice(0, next.caret)}|${next.value.slice(next.caret)}`;
    };
    expect(edit('123-45', '123-456|')).toBe('123-45-6|');
    expect(edit('123-45-6', '123-45|6')).toBe('123-4|6');
    expect(edit('123-45-67891', '123-45-678912|')).toBe('123-45-67891|');
  });
});
