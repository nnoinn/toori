// 로그인·가입 흐름의 화면 주소 (#47 3·8장). proxy, 로그인 콜백, ensure…Page가 같은 규칙으로 보낸다.

import { safeNextPath } from '@/lib/safe-next';

import { type AccountMode, hasAccountFor } from './account-mode';
import type { CurrentAccount } from './current-account';

/** next가 없거나 안전하지 않을 때 돌아갈 곳(로그인 화면 login-params.ts와 같은 값) */
export const DEFAULT_NEXT: Record<AccountMode, string> = {
  customer: '/',
  owner: '/owner',
};

/** 로그인 실패 이유. 로그인 화면이 문구를 고른다 */
export type LoginError = 'login_failed' | 'email_required';

/** 로그인 화면(정찬형, #47 8장). 토글 처음 값과 로그인 뒤 돌아갈 주소를 붙인다 */
export function loginPath(mode: AccountMode, next?: string | null, error?: LoginError): string {
  const params = new URLSearchParams({ mode, next: safeNextPath(next, DEFAULT_NEXT[mode]) });
  if (error) params.set('error', error);
  return `/login?${params}`;
}

/** 고객 약관 동의 화면(정찬형 C-104). 동의하면 next로 돌아간다 */
export function customerJoinPath(next?: string | null): string {
  return `/join?${new URLSearchParams({ next: safeNextPath(next, DEFAULT_NEXT.customer) })}`;
}

/** 원장님 가입 화면(정민석 S-101) */
export const OWNER_JOIN_PATH = '/owner/join';

/** 로그인 직후 보낼 곳. 고른 모드의 계정이 없으면 가입 화면으로, 있으면 보던 화면으로 */
export function afterLoginPath(
  account: CurrentAccount | null,
  mode: AccountMode,
  next?: string | null,
): string {
  if (hasAccountFor(account, mode)) return safeNextPath(next, DEFAULT_NEXT[mode]);
  return mode === 'customer' ? customerJoinPath(next) : OWNER_JOIN_PATH;
}
