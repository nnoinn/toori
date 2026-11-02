// 전화번호 저장 모양 (10/28 결정). 고객·원장님·샵 전화번호를 모두 하이픈 넣은 모양으로 맞춰 저장한다.
// 가입·내 정보·샵 정보 저장 함수가 이 함수 하나로 맞춰서, 같은 번호가 표마다 다른 모양으로 들어가지 않게 한다.
// 저장한 모양 그대로 화면에 보여 주면 된다. 인증 없이 모양만 본다(schema-v1). 화면·서버 어디서나 쓴다.
// 고객 연락처 입력칸이 치는 동안 보여 주는 모양(formatPhoneInput, #183)도 여기 둔다.

/** mobile: 휴대폰만(고객 연락처, #19 D31). any: 원장님·샵 전화번호 */
export type PhoneKind = 'mobile' | 'any';

/** 011·016~019. 예전 휴대폰 번호라 가운데가 3자리일 수 있다(011-123-4567) */
const OLD_MOBILE_HEAD = /^01[16789]/;

/** 숫자 앞부분(하이픈 앞 첫 칸)과 그 뒤에 올 수 있는 숫자 개수. 뒤 숫자는 가운데 3~4자리와 끝 4자리로 나눈다 */
const PHONE_RULES: { kind: PhoneKind; head: RegExp; restLengths: number[] }[] = [
  // 010-1234-5678
  { kind: 'mobile', head: /^010/, restLengths: [8] },
  { kind: 'mobile', head: OLD_MOBILE_HEAD, restLengths: [7, 8] },
  // 02-123-4567, 02-1234-5678
  { kind: 'any', head: /^02/, restLengths: [7, 8] },
  // 지역번호 031~064와 인터넷전화 070. 예: 031-123-4567
  { kind: 'any', head: /^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4]|70)/, restLengths: [7, 8] },
  // 안심번호 0502~0508. 예: 0507-1234-5678(네이버 플레이스)
  { kind: 'any', head: /^050[2-8]/, restLengths: [7, 8] },
];

/** 대표번호 15xx·16xx·18xx. 예: 1588-1234 */
const REPRESENTATIVE_NUMBER = /^1[568]\d{6}$/;

/**
 * 입력한 번호를 하이픈 넣은 모양으로 바꾼다. 하이픈·공백은 있어도 없어도 된다. 번호 모양이 아니면 null.
 * 예: normalizePhone('01012345678', 'mobile') → '010-1234-5678', normalizePhone('0311234567') → '031-123-4567',
 * normalizePhone('050712345678') → '0507-1234-5678', normalizePhone('0311234567', 'mobile') → null
 */
export function normalizePhone(raw: string, kind: PhoneKind = 'any'): string | null {
  if (!/^[\d\s-]+$/.test(raw.trim())) return null;
  const digits = raw.replace(/\D/g, '');

  if (kind === 'any' && REPRESENTATIVE_NUMBER.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  for (const rule of PHONE_RULES) {
    if (kind === 'mobile' && rule.kind !== 'mobile') continue;
    const head = rule.head.exec(digits)?.[0];
    if (!head) continue;
    const rest = digits.slice(head.length);
    if (!rule.restLengths.includes(rest.length)) return null;
    return `${head}-${rest.slice(0, -4)}-${rest.slice(-4)}`;
  }
  return null;
}

/** 휴대폰 번호 입력칸에 들어가는 숫자 수(010-1234-5678) */
export const PHONE_INPUT_MAX_DIGITS = 11;

/**
 * 휴대폰 번호를 치는 동안 보이는 모양(#183). 숫자만 남기고 11자리까지 자른 뒤 치는 대로 하이픈을 넣는다.
 * 3-4-4로 나누고, 011·016~019의 10자리 번호만 3-3-4로 나눈다. 저장할 수 있는 번호인지는 normalizePhone이 본다.
 * 예: '0101' → '010-1', '0101234' → '010-1234', '01012345' → '010-1234-5', '0111234567' → '011-123-4567'
 */
export function formatPhoneInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, PHONE_INPUT_MAX_DIGITS);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  const middle = digits.length === 10 && OLD_MOBILE_HEAD.test(digits) ? 3 : 4;
  return `${digits.slice(0, 3)}-${digits.slice(3, 3 + middle)}-${digits.slice(3 + middle)}`;
}

/**
 * 번호를 끝까지 쳤는지(11자리). 011·016~019의 10자리 번호는 11자리까지 더 칠 수 있어서
 * 여기서는 다 친 것으로 보지 않고, 입력칸을 벗어날 때 저장한다(#183)
 */
export function isPhoneInputFull(value: string): boolean {
  return value.replace(/\D/g, '').length >= PHONE_INPUT_MAX_DIGITS;
}

const countDigits = (text: string) => text.replace(/\D/g, '').length;

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
 * 휴대폰 번호 입력칸 글자가 바뀌었을 때 새 모양과 커서 위치(#183, 공통 UI PhoneInput이 쓴다).
 * prev는 바뀌기 전 값, raw는 브라우저가 바꾼 값, caret은 바뀐 뒤 커서 위치다.
 * - 커서는 "앞에 있는 숫자 개수"로 옮긴다. 하이픈이 붙거나 빠져도 같은 숫자 뒤에 남는다
 * - 하이픈만 지워졌으면(지우기·Delete) 그 옆 숫자를 지운다. 하이픈 바로 뒤에서 지우기를 눌러도 멈추지 않게
 * - 11자리를 다 친 뒤 더 치면 받지 않는다(붙여 넣은 긴 번호는 11자리까지 자른다)
 */
export function editPhoneInput(
  prev: string,
  raw: string,
  caret: number,
  deleteForward = false,
): { value: string; caret: number } {
  const prevDigits = prev.replace(/\D/g, '');
  let digits = raw.replace(/\D/g, '');
  let before = countDigits(raw.slice(0, caret));

  if (raw.length < prev.length && digits === prevDigits) {
    if (deleteForward) {
      digits = digits.slice(0, before) + digits.slice(before + 1);
    } else if (before > 0) {
      digits = digits.slice(0, before - 1) + digits.slice(before);
      before -= 1;
    }
  }
  if (digits.length > PHONE_INPUT_MAX_DIGITS && prevDigits.length >= PHONE_INPUT_MAX_DIGITS) {
    const added = digits.length - prevDigits.length;
    return { value: prev, caret: caretAfterDigits(prev, before - added) };
  }
  const value = formatPhoneInput(digits);
  return { value, caret: caretAfterDigits(value, Math.min(before, countDigits(value))) };
}
