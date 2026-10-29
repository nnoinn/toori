// 전화번호 저장 모양 (10/28 결정). 고객·원장님·샵 전화번호를 모두 하이픈 넣은 모양으로 맞춰 저장한다.
// 가입·내 정보·샵 정보 저장 함수가 이 함수 하나로 맞춰서, 같은 번호가 표마다 다른 모양으로 들어가지 않게 한다.
// 저장한 모양 그대로 화면에 보여 주면 된다. 인증 없이 모양만 본다(schema-v1). 화면·서버 어디서나 쓴다.

/** mobile: 휴대폰만(고객 연락처, #19 D31). any: 원장님·샵 전화번호 */
export type PhoneKind = 'mobile' | 'any';

/** 숫자 앞부분(하이픈 앞 첫 칸)과 그 뒤에 올 수 있는 숫자 개수. 뒤 숫자는 가운데 3~4자리와 끝 4자리로 나눈다 */
const PHONE_RULES: { kind: PhoneKind; head: RegExp; restLengths: number[] }[] = [
  // 010-1234-5678. 011·016~019는 예전 번호라 가운데가 3자리일 수 있다
  { kind: 'mobile', head: /^010/, restLengths: [8] },
  { kind: 'mobile', head: /^01[16789]/, restLengths: [7, 8] },
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
