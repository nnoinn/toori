// 전화번호 저장 모양 (10/28 결정). 고객·원장님·샵 전화번호를 모두 하이픈 넣은 모양으로 맞춰 저장한다.
// 가입·내 정보·샵 정보 저장 함수가 이 함수 하나로 맞춰서, 같은 번호가 표마다 다른 모양으로 들어가지 않게 한다.
// 저장한 모양 그대로 화면에 보여 주면 된다. 인증 없이 모양만 본다(schema-v1). 화면·서버 어디서나 쓴다.
// 입력칸이 치는 동안 보여 주는 모양도 여기 둔다. 휴대폰은 formatPhoneInput(#183), 샵 전화번호는 formatAnyPhoneInput(#205).

import type { DigitInputRule } from './digit-input';

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
const REPRESENTATIVE_HEAD = /^1[568]\d{2}/;

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

/** 앞자리를 아직 다 치지 않았거나 없는 앞자리일 때 받는 숫자 수. 가장 긴 번호(0507-1234-5678)에 맞춘다 */
const ANY_PHONE_INPUT_MAX_DIGITS = 12;

/** 치는 중인 번호(any)의 앞자리와 그 뒤 숫자 수. 앞자리를 아직 다 치지 않았거나 없는 앞자리면 null */
function anyPhoneRule(digits: string): { head: string; restLengths: number[] } | null {
  const representative = REPRESENTATIVE_HEAD.exec(digits)?.[0];
  if (representative) return { head: representative, restLengths: [4] };
  for (const rule of PHONE_RULES) {
    const head = rule.head.exec(digits)?.[0];
    if (head) return { head, restLengths: rule.restLengths };
  }
  return null;
}

/** 이 숫자로 시작하는 번호(any)가 가질 수 있는 가장 많은 자릿수. 예: 02 → 10, 031 → 11, 0507 → 12, 1588 → 8 */
function anyPhoneMaxDigits(digits: string): number {
  const rule = anyPhoneRule(digits);
  return rule ? rule.head.length + Math.max(...rule.restLengths) : ANY_PHONE_INPUT_MAX_DIGITS;
}

/**
 * 원장님·샵 전화번호(any)를 치는 동안 보이는 모양(#205). 앞자리(02·031·070·0507·010·1588 등)에 맞춰
 * 하이픈을 넣고 그 번호의 자릿수까지만 받는다. 가운데는 4자리로 넣다가, 가운데가 3자리인 번호를 끝까지 쳤으면
 * 3자리로 나눈다(휴대폰 formatPhoneInput과 같은 방식). 앞자리를 아직 다 치지 않았거나 없는 앞자리면 숫자만 보인다.
 * 저장할 수 있는 번호인지는 normalizePhone이 본다.
 * 예: '0212345678' → '02-1234-5678', '0311234567' → '031-123-4567', '050712345678' → '0507-1234-5678',
 * '15881234' → '1588-1234'
 */
export function formatAnyPhoneInput(raw: string): string {
  const all = raw.replace(/\D/g, '');
  const digits = all.slice(0, anyPhoneMaxDigits(all));
  const rule = anyPhoneRule(digits);
  if (!rule) return digits;
  const rest = digits.slice(rule.head.length);
  if (rest === '') return rule.head;
  const middle = rule.restLengths.includes(7) && rest.length === 7 ? 3 : 4;
  if (rest.length <= middle) return `${rule.head}-${rest}`;
  return `${rule.head}-${rest.slice(0, middle)}-${rest.slice(middle)}`;
}

/** 전화번호 입력칸 규칙(공통 UI PhoneInput). mobile은 11자리까지, any는 앞자리에 맞춘 자릿수까지 */
export const PHONE_INPUT_RULES: Record<PhoneKind, DigitInputRule> = {
  mobile: { format: formatPhoneInput, maxDigits: () => PHONE_INPUT_MAX_DIGITS },
  any: { format: formatAnyPhoneInput, maxDigits: anyPhoneMaxDigits },
};

/** 휴대폰 번호 오류 문구(고객 연락처). 화면과 서버 함수가 같이 쓴다 */
export const PHONE_FORMAT_MESSAGE = '휴대폰 번호를 확인해 주세요. 예: 010-1234-5678';

/** 휴대폰 번호 가운데를 가린다(운영자 목록, 원장님 예약 상세). 예: "010-1234-5678" → "010-****-5678". 번호가 없으면 "-" */
export function maskPhone(phone: string | null): string {
  if (!phone) return '-';
  const parts = phone.split('-');
  if (parts.length === 3) return [parts[0], '*'.repeat(parts[1].length), parts[2]].join('-');
  return `****${phone.slice(-4)}`;
}
