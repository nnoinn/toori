// 번호 입력칸이 치는 동안 모양을 맞추는 공통 부분(#183, #205). 화면·서버 어디서나 쓴다.
// 휴대폰·전화번호(phone.ts), 사업자등록번호(business-number.ts), 계좌번호가 같이 쓴다.
// 숫자만 받고, 정한 자릿수를 넘으면 더 받지 않고, 양식에 하이픈이 있으면 치는 대로 넣는다(conventions "번호 입력칸").
// 저장할 수 있는 번호인지는 각 검사 함수(normalizePhone, isValidBusinessNumber 등)가 본다.

/** 번호 칸 한 종류의 입력 규칙 */
export type DigitInputRule = {
  /** 자릿수 안의 숫자를 칸에 보이는 모양으로. 양식에 하이픈이 없으면 숫자 그대로 */
  format: (digits: string) => string;
  /** 이 숫자로 시작하는 번호가 가질 수 있는 가장 많은 자릿수(전화번호는 앞자리마다 다르다) */
  maxDigits: (digits: string) => number;
};

const toDigits = (text: string) => text.replace(/\D/g, '');

/** 숫자만 남기고 자릿수까지 자른 뒤 규칙 모양으로. 붙여 넣은 값·저장된 값도 같은 모양이 된다 */
export function formatDigitInput(rule: DigitInputRule, raw: string): string {
  const digits = toDigits(raw);
  return rule.format(digits.slice(0, rule.maxDigits(digits)));
}

/** 하이픈 넣은 번호에서 앞에서 n번째 숫자 바로 뒤 위치 */
function caretAfterDigits(value: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (!/\d/.test(value[i])) continue;
    seen += 1;
    if (seen === n) return i + 1;
  }
  return value.length;
}

/**
 * 번호 입력칸 글자가 바뀌었을 때 새 모양과 커서 위치(공통 UI DigitInput·PhoneInput이 쓴다).
 * prev는 바뀌기 전 값, raw는 브라우저가 바꾼 값, caret은 바뀐 뒤 커서 위치다.
 * - 커서는 "앞에 있는 숫자 개수"로 옮긴다. 하이픈이 붙거나 빠져도 같은 숫자 뒤에 남는다
 * - 하이픈만 지워졌으면(지우기·Delete) 그 옆 숫자를 지운다. 하이픈 바로 뒤에서 지우기를 눌러도 멈추지 않게
 * - 자릿수를 다 친 뒤 더 치면 받지 않는다(붙여 넣은 긴 번호는 자릿수까지 자른다)
 */
export function editDigitInput(
  rule: DigitInputRule,
  prev: string,
  raw: string,
  caret: number,
  deleteForward = false,
): { value: string; caret: number } {
  const prevDigits = toDigits(prev);
  let digits = toDigits(raw);
  let before = toDigits(raw.slice(0, caret)).length;

  if (raw.length < prev.length && digits === prevDigits) {
    if (deleteForward) {
      digits = digits.slice(0, before) + digits.slice(before + 1);
    } else if (before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before);
      before -= 1;
    }
  }
  if (digits.length > rule.maxDigits(digits) && prevDigits.length >= rule.maxDigits(prevDigits)) {
    const added = digits.length - prevDigits.length;
    return { value: prev, caret: caretAfterDigits(prev, before - added) };
  }
  const value = formatDigitInput(rule, digits);
  return { value, caret: caretAfterDigits(value, Math.min(before, toDigits(value).length)) };
}
