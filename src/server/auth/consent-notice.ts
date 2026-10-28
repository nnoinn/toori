// 가입 때 고른 광고성 정보 수신 동의의 처리 결과를 가입 직후 처음 보이는 화면에 한 번 보여주기 위한 쿠키
// (동의 문구 6-1장, #47 4장, 10/27 결정). 가입 저장(createCustomerAccount)이 남기고, takeMarketingConsentNotice가 읽으면서 지운다.
// 가입은 성공하면 바로 다음 화면으로 넘어가고 그 화면이 어디인지 정해져 있지 않아서, 주소 대신 쿠키로 넘긴다.

import 'server-only';

export const MARKETING_NOTICE_COOKIE = 'marketing_consent_notice';

/** 화면 스크립트가 읽지 못하게(httpOnly) 하고, 가입 직후에만 쓰므로 1시간 뒤 사라진다 */
export const MARKETING_NOTICE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60,
} as const;

/** 쿠키 값: 누구의 동의인지와 동의 시각. 같은 브라우저에서 다른 사람이 로그인했을 때 남의 결과를 보여주지 않으려고 사용자 id를 같이 둔다 */
export function encodeMarketingNotice(userId: string, agreedAt: Date): string {
  return `${userId}|${agreedAt.toISOString()}`;
}

/** 지금 로그인한 사람의 값이면 동의 시각, 아니거나 모양이 틀리면 null */
export function decodeMarketingNotice(value: string, userId: string): Date | null {
  const [owner, iso] = value.split('|');
  if (owner !== userId || !iso) return null;
  const agreedAt = new Date(iso);
  return Number.isNaN(agreedAt.getTime()) ? null : agreedAt;
}
