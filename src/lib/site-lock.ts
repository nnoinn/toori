// 개발하는 동안 toori.kr과 미리보기 주소에 팀원만 들어오게 하는 잠금(#303, 11/9 nnoinn 결정).
// 환경변수 SITE_LOCK_CODE(팀 접속 코드)가 있으면 잠그고, 없으면 잠그지 않는다. 값은 nnoinn이 Vercel Production·Preview에만 넣는다.
// 로컬 .env.local에는 넣지 않으므로 로컬 개발과 npm run screenshot은 지금 그대로다.
// 코드가 맞으면 입장 쿠키를 굽는다. 쿠키에는 코드가 아니라 코드로 만든 값(HMAC)을 넣어서, 코드를 바꾸면 전에 받은 쿠키는 통하지 않는다.
// proxy(src/proxy.ts)가 화면마다 확인하고, 잠금 화면(src/app/coming-soon/)이 코드를 받는다.

import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { safeNextPath } from './safe-next';

/** 잠금 화면(소개 페이지) 주소. 이 주소 자체는 잠그지 않는다 */
export const SITE_LOCK_PATH = '/coming-soon';

/** 입장 쿠키 이름 */
export const SITE_ACCESS_COOKIE = 'site_access';

/** 스크립트가 읽지 못하게(httpOnly) 하고 90일 동안 기억한다 */
export const SITE_ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  // Strict면 카카오·구글 로그인이나 결제창에서 돌아올 때 쿠키가 붙지 않아 잠금 화면으로 튕긴다
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 90 * 24 * 60 * 60,
} as const;

/** 잠금 중에는 모든 화면 응답에 붙여서 검색에 나오지 않게 한다 */
export const NOINDEX_HEADER = { name: 'X-Robots-Tag', value: 'noindex, nofollow' } as const;

// 쿠키 값을 만들 때 코드와 함께 쓰는 고정 글자. 쿠키 모양을 바꿔 모두 다시 입장하게 하려면 v1을 v2로 바꾼다
const ACCESS_TOKEN_CONTEXT = 'toori-site-access-v1';

/** 띄어쓰기 개수, 앞뒤 공백, 영문 대소문자, 한글 조합 방식(맥의 자모 분리)이 달라도 같은 코드로 본다 */
export function normalizeTeamCode(code: string): string {
  return code.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 잠금이 켜져 있으면 정리한 팀 접속 코드를, 꺼져 있으면 null을 돌려준다 */
export function siteLockCode(): string | null {
  const code = normalizeTeamCode(process.env.SITE_LOCK_CODE ?? '');
  return code === '' ? null : code;
}

/** 입장 쿠키 값. 코드가 같으면 늘 같고, 쿠키 값으로 코드를 알아낼 수 없다 */
export function siteAccessToken(code: string): string {
  return createHmac('sha256', normalizeTeamCode(code))
    .update(ACCESS_TOKEN_CONTEXT)
    .digest('base64url');
}

// 맞힌 글자 수가 응답 시간으로 새지 않게 같은 시간에 비교한다
function sameValue(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 입장 쿠키가 지금 코드로 만든 값인지 */
export function hasSiteAccess(cookieValue: string | undefined, code: string): boolean {
  return cookieValue !== undefined && sameValue(cookieValue, siteAccessToken(code));
}

/** 잠금 화면에 넣은 코드가 팀 접속 코드와 같은지 */
export function isTeamCode(input: string, code: string): boolean {
  return sameValue(siteAccessToken(input), siteAccessToken(code));
}

export function isSiteLockPath(pathname: string): boolean {
  return pathname === SITE_LOCK_PATH || pathname.startsWith(`${SITE_LOCK_PATH}/`);
}

/** 코드를 넣은 뒤 돌아갈 곳. 우리 사이트 안 주소만 받고, 잠금 화면 자체면 첫 화면으로 보낸다 */
export function siteEntryNextPath(next: string | null | undefined): string {
  const path = safeNextPath(next, '/');
  return isSiteLockPath(path.split(/[?#]/, 1)[0]) ? '/' : path;
}

/** 잠금 화면 주소. 원래 가려던 주소를 next로 붙인다(첫 화면 /이면 붙이지 않는다) */
export function lockScreenPath(pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  // 화면 이동 중 요청에 Next.js가 붙이는 내부 값은 돌아갈 주소에 남기지 않는다
  params.delete('_rsc');
  const query = params.toString();
  const here = query ? `${pathname}?${query}` : pathname;
  return here === '/' ? SITE_LOCK_PATH : `${SITE_LOCK_PATH}?${new URLSearchParams({ next: here })}`;
}

export type SiteLockDecision =
  /** 잠금이 꺼져 있거나 입장한 팀원: 지금처럼 진행한다 */
  | { type: 'pass' }
  /** 입장하지 않은 사람이 잠금 화면을 연다: 로그인 세션 갱신 없이 잠금 화면을 그대로 보여준다 */
  | { type: 'lock_screen' }
  | { type: 'redirect'; to: string };

/**
 * proxy가 요청마다 묻는 잠금 규칙. code는 siteLockCode()의 값(null이면 잠금 꺼짐)이다.
 * - 입장하지 않은 화면 요청은 잠금 화면으로 보낸다
 * - 잠금 화면은 입장하지 않은 사람에게만 보여주고, 잠금이 꺼졌거나 이미 입장했으면 가려던 화면으로 보낸다.
 *   단 코드 입력(서버 함수 POST)은 그대로 통과시켜서 서버 함수가 처리한다
 */
export function decideSiteLock({
  code,
  accessCookie,
  method,
  pathname,
  search,
}: {
  code: string | null;
  accessCookie: string | undefined;
  method: string;
  pathname: string;
  search: string;
}): SiteLockDecision {
  const entered = code === null || hasSiteAccess(accessCookie, code);
  if (isSiteLockPath(pathname)) {
    if (!entered) return { type: 'lock_screen' };
    if (method === 'GET' || method === 'HEAD') {
      return { type: 'redirect', to: siteEntryNextPath(new URLSearchParams(search).get('next')) };
    }
    return { type: 'pass' };
  }
  return entered ? { type: 'pass' } : { type: 'redirect', to: lockScreenPath(pathname, search) };
}
