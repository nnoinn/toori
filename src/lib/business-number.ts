// 사업자등록번호 (#205). 화면·서버 어디서나 쓴다. 저장은 숫자 10자리, 화면에는 123-45-67890 모양으로 보여 준다.
// 마지막 자리는 국세청 검증번호라서, 계산이 맞지 않으면 아무 숫자나 넣은 번호로 보고 막는다.
// 진짜 있는 사업자인지(휴폐업 포함)는 출시 전 국세청 진위확인에서 따로 본다(#208).

import type { DigitInputRule } from './digit-input';

export const BUSINESS_NUMBER_DIGITS = 10;

/** 국세청 검증번호 가중치(앞 9자리에 곱한다) */
const CHECK_WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

/**
 * 앞 9자리로 마지막 자리(검증번호)를 계산한다. 각 자리 × 가중치의 합에 (9번째 자리 × 5)의 십의 자리를 더하고,
 * 10에서 그 합의 일의 자리를 뺀 값이다(10이면 0).
 * 시험용 번호도 이걸로 만든다: 아무 숫자 9자리 + 이 값. 예: '123456789' → 1이라 123-45-67891
 */
export function businessNumberCheckDigit(first9: string): number {
  let sum = 0;
  CHECK_WEIGHTS.forEach((weight, i) => {
    sum += Number(first9[i]) * weight;
  });
  sum += Math.floor((Number(first9[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10;
}

/** 숫자 10자리이고 검증번호가 맞는지. 하이픈·공백은 있어도 된다 */
export function isValidBusinessNumber(raw: string): boolean {
  const digits = raw.replace(/[-\s]/g, '');
  if (!/^\d{10}$/.test(digits)) return false;
  return businessNumberCheckDigit(digits.slice(0, 9)) === Number(digits[9]);
}

/** 숫자 10자리 → 123-45-67890. 10자리가 아니면 그대로 */
export function formatBusinessNumber(digits: string): string {
  return /^\d{10}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
    : digits;
}

/** 치는 동안 보이는 모양: 3-2-5로 치는 대로 하이픈을 넣는다. 예: '1234' → '123-4', '123456' → '123-45-6' */
export function formatBusinessNumberInput(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** 사업자등록번호 입력칸 규칙(공통 UI DigitInput). 10자리까지 */
export const BUSINESS_NUMBER_INPUT: DigitInputRule = {
  format: formatBusinessNumberInput,
  maxDigits: () => BUSINESS_NUMBER_DIGITS,
};
