// 이메일 표시 도우미.

/**
 * 이메일 앞부분을 가린다(운영자 회원 상세, #360 4번). 예: "abcdef@gmail.com" → "ab****@gmail.com".
 * 앞부분이 두 글자 이하면 첫 글자만 남긴다. 이메일이 없으면 "-", @가 없으면 "****"
 */
export function maskEmail(email: string | null): string {
  if (!email) return '-';
  const at = email.lastIndexOf('@');
  if (at <= 0) return '****';
  const local = email.slice(0, at);
  const keep = local.length > 2 ? 2 : 1;
  return `${local.slice(0, keep)}****${email.slice(at)}`;
}
