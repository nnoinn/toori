// 로그인·가입 흐름의 화면 주소 (#47 3·8장). proxy, 로그인 콜백, ensure…Page가 같은 규칙으로 보낸다.

import { safeNextPath } from '@/lib/safe-next';

import { type AccountMode, hasAccountFor } from './account-mode';
import type { CurrentAccount } from './current-account';

/** 고객 홈(#215). 첫 화면(/)은 로그인(계정 고르기)이고, 고객 화면의 "홈"은 여기다 */
export const CUSTOMER_HOME = '/home';

/** next가 없거나 안전하지 않을 때 돌아갈 곳. 로그인 화면(login-params.ts)도 이 값을 쓴다 */
export const DEFAULT_NEXT: Record<AccountMode, string> = {
  customer: CUSTOMER_HOME,
  owner: '/owner',
  admin: '/admin',
};

/** 운영자 입구(#372 1장). 첫 화면과 /login에는 고객·원장님만 두고, 운영자는 여기서 따로 로그인한다 */
export const ADMIN_LOGIN_PATH = '/admin/login';

/** 로그인 실패 이유. 로그인 화면이 문구를 고른다 */
export type LoginError = 'login_failed' | 'email_required';

/** 운영자 입구의 실패 이유. not_admin: 운영자 입구로 들어왔는데 운영자 권한이 없다(#372 1장) */
export type AdminLoginError = LoginError | 'not_admin';

/**
 * 로그인 화면. 고객·원장님은 /login(정찬형, #47 8장)에 토글 처음 값과 로그인 뒤 돌아갈 주소를 붙이고,
 * 운영자는 운영자 입구(/admin/login)에 돌아갈 주소를 붙인다
 */
export function loginPath(
  mode: AccountMode,
  next?: string | null,
  error?: AdminLoginError,
): string {
  const safeNext = safeNextPath(next, DEFAULT_NEXT[mode]);
  const params =
    mode === 'admin'
      ? new URLSearchParams({ next: safeNext })
      : new URLSearchParams({ mode, next: safeNext });
  if (error) params.set('error', error);
  return `${mode === 'admin' ? ADMIN_LOGIN_PATH : '/login'}?${params}`;
}

/** 고객 약관 동의 화면(정찬형 C-104). 동의하면 next로 돌아간다 */
export function customerJoinPath(next?: string | null): string {
  return `/join?${new URLSearchParams({ next: safeNextPath(next, DEFAULT_NEXT.customer) })}`;
}

/** 원장님 가입 화면(정민석 S-101) */
export const OWNER_JOIN_PATH = '/owner/join';

/**
 * 로그인 직후 보낼 곳. 고른 모드의 계정이 없으면 가입 화면으로, 있으면 보던 화면으로.
 * 운영자는 가입이 없어서 권한이 없으면 운영자 입구로 돌려보낸다(로그인 콜백이 먼저 로그아웃시킨다)
 */
export function afterLoginPath(
  account: CurrentAccount | null,
  mode: AccountMode,
  next?: string | null,
): string {
  if (hasAccountFor(account, mode)) return safeNextPath(next, DEFAULT_NEXT[mode]);
  if (mode === 'admin') return loginPath('admin', next, 'not_admin');
  return mode === 'customer' ? customerJoinPath(next) : OWNER_JOIN_PATH;
}
