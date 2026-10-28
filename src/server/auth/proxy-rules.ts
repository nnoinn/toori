// proxy의 1차 확인 규칙 (#47 3장). 로그인 세션과 account_mode 쿠키만 보고, DB는 보지 않는다.
// 2차 확인은 화면의 ensure…Page()와 서버 함수의 require…()가 DB를 보고 한다.

import type { AccountMode } from './account-mode';
import { loginPath, OWNER_JOIN_PATH } from './paths';

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
  // 운영자 화면: 로그인하지 않았으면 화면이 있다는 것도 알리지 않는다(관리자 여부는 ensureAdminPage가 본다)
  if (under(pathname, '/admin')) {
    return loggedIn ? NEXT : { type: 'not_found' };
  }
  return NEXT;
}
