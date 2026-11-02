// 원장님 화면 문구용 한국어 도우미. 화면('use client')과 서버 어디서나 쓴다.
// 입력 칸 이름이나 원장님이 정한 메뉴 이름 뒤에 붙는 조사를 받침에 맞춘다("예금주를", "상호를", "이름을").

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** 한글 음절 하나 안의 받침 가짓수(없음 포함) */
const FINAL_CONSONANTS = 28;

/**
 * 낱말 뒤에 목적격 조사 '을/를'을 붙인다. 마지막 글자가 한글이면 받침이 있으면 '을', 없으면 '를'.
 * 마지막 글자가 한글이 아니면(영문·숫자 메뉴 이름 등) 소리를 알 수 없어서 '을(를)'로 둔다.
 * 예: '예금주' → '예금주를', '대표자명' → '대표자명을', 'Cut' → 'Cut을(를)'
 */
export function withObjectParticle(word: string): string {
  const last = word.trimEnd().codePointAt(word.trimEnd().length - 1);
  if (last === undefined || last < HANGUL_FIRST || last > HANGUL_LAST) return `${word}을(를)`;
  const hasFinal = (last - HANGUL_FIRST) % FINAL_CONSONANTS !== 0;
  return `${word}${hasFinal ? '을' : '를'}`;
}
