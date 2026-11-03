// 원장님 화면 문구용 한국어 도우미. 화면('use client')과 서버 어디서나 쓴다.
// 입력 칸 이름·업종 이름·원장님이 정한 메뉴 이름 뒤에 붙는 조사를 받침에 맞춘다("예금주를", "이름을", "네일·속눈썹으로").

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 한글 음절 하나 안의 받침 가짓수(없음 포함) */
const FINAL_CONSONANTS = 28;
/** 받침 'ㄹ'의 순서(받침 없음 0부터 센다). '로/으로'는 ㄹ 받침 뒤에서 '로'가 된다("서울로") */
const FINAL_RIEUL = 8;

/** 마지막 글자의 받침 순서(없으면 0). 마지막 글자가 한글이 아니면 소리를 알 수 없어서 null */
function finalConsonant(word: string): number | null {
  const trimmed = word.trimEnd();
  const last = trimmed.codePointAt(trimmed.length - 1);
  if (last === undefined || last < HANGUL_FIRST || last > HANGUL_LAST) return null;
  return (last - HANGUL_FIRST) % FINAL_CONSONANTS;
}

/**
 * 낱말 뒤에 목적격 조사 '을/를'을 붙인다. 받침이 있으면 '을', 없으면 '를'.
 * 마지막 글자가 한글이 아니면(영문·숫자 메뉴 이름 등) '을(를)'로 둔다.
 * 예: '예금주' → '예금주를', '대표자명' → '대표자명을', 'Cut' → 'Cut을(를)'
 */
export function withObjectParticle(word: string): string {
  const final = finalConsonant(word);
  if (final === null) return `${word}을(를)`;
  return `${word}${final === 0 ? '를' : '을'}`;
}

/**
 * 낱말 뒤에 방향 조사 '로/으로'를 붙인다. 받침이 없거나 'ㄹ' 받침이면 '로', 다른 받침이면 '으로'.
 * 마지막 글자가 한글이 아니면 '(으)로'로 둔다.
 * 예: '미용실' → '미용실로', '네일·속눈썹' → '네일·속눈썹으로', '헤어' → '헤어로'
 */
export function withDirectionParticle(word: string): string {
  const final = finalConsonant(word);
  if (final === null) return `${word}(으)로`;
  return `${word}${final === 0 || final === FINAL_RIEUL ? '로' : '으로'}`;
}
