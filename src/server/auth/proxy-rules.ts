// proxy의 1차 확인 규칙 (#47 3장). 로그인 세션과 account_mode 쿠키만 보고, DB는 보지 않는다.
// 2차 확인은 화면의 ensure…Page()와 서버 함수의 require…()가 DB를 보고 한다.

import type { AccountMode } from './account-mode';
import { ADMIN_LOGIN_PATH, DEFAULT_NEXT, loginPath, OWNER_JOIN_PATH } from './paths';

export type ProxyDecision =
  { type: 'next' } | { type: 'redirect'; to: string } | { type: 'not_found' };

const NEXT: ProxyDecision = { type: 'next' };

function under(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function decideProxy({
  pathname,
  search,
  loggedIn,
  mode,
}: {
  pathname: string;
  search: string;
  loggedIn: boolean;
  mode: AccountMode;
}): ProxyDecision {
  const here = `${pathname}${search}`;

  // 원장님 가입: 원장님 모드로 로그인했으면 원장님 계정이 없어도 들어온다
  if (under(pathname, OWNER_JOIN_PATH)) {
    return loggedIn && mode === 'owner'
      ? NEXT
      : { type: 'redirect', to: loginPath('owner', OWNER_JOIN_PATH) };
  }
  // 그 밖의 원장님 화면: 원장님 모드로 로그인해야 들어온다
  if (under(pathname, '/owner')) {
    return loggedIn && mode === 'owner' ? NEXT : { type: 'redirect', to: loginPath('owner', here) };
  }
  // 운영자 입구: 누구나 열 수 있고, 이미 운영자로 들어와 있으면 운영자 화면으로 보낸다(#372 2장)
  if (under(pathname, ADMIN_LOGIN_PATH)) {
    return loggedIn && mode === 'admin' ? { type: 'redirect', to: DEFAULT_NEXT.admin } : NEXT;
  }
  // 그 밖의 운영자 화면: 운영자 모드가 아니면(고객·원장님으로 들어와 있어도) 운영자 입구로 보낸다.
  // 운영자 권한(is_admin)은 DB를 봐야 해서 ensureAdminPage가 본다
  if (under(pathname, '/admin')) {
    return loggedIn && mode === 'admin' ? NEXT : { type: 'redirect', to: loginPath('admin', here) };
  }
  return NEXT;
}
