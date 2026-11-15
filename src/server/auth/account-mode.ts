// 지금 어느 계정(고객/원장님/운영자)으로 들어왔는지 (X-101, #47 1·3장, #372).
// 로그인 화면 토글 값을 서버가 httpOnly 쿠키 account_mode로 기억한다. 화면 코드는 쿠키를 직접 읽지 않는다.
// 운영자(admin)는 운영자 입구(/admin/login)로 로그인할 때만 되고, 계정 바꾸기로는 들어갈 수 없다(#372 1장, 11/13 nnoinn).

import type { CurrentAccount } from './current-account';

export const ACCOUNT_MODES = ['customer', 'owner', 'admin'] as const;

export type AccountMode = (typeof ACCOUNT_MODES)[number];

/** 로그인 화면 토글과 계정 바꾸기로 고를 수 있는 모드(고객·원장님). 운영자는 운영자 입구로만 들어온다 */
export const SWITCHABLE_ACCOUNT_MODES = ['customer', 'owner'] as const;

export const ACCOUNT_MODE_COOKIE = 'account_mode';

/** 브라우저 스크립트가 읽지 못하게(httpOnly) 하고, 1년 동안 기억한다 */
export const ACCOUNT_MODE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 365 * 24 * 60 * 60,
} as const;

/** 로그인 화면 토글의 처음 값. 운영자로 들어와 있으면 고객으로 보여준다(운영자는 토글에 없다) */
export function toSwitchableMode(
  mode: AccountMode | null | undefined,
): (typeof SWITCHABLE_ACCOUNT_MODES)[number] {
  return mode === 'owner' ? 'owner' : 'customer';
}

/** 쿠키 값을 읽는다. owner·admin이 아니면 모두 customer(#47 1장: 없으면 'customer') */
export function parseAccountMode(value: string | null | undefined): AccountMode {
  return value === 'owner' || value === 'admin' ? value : 'customer';
}

/**
 * 그 모드의 계정이 있는지. 원장님은 계정과 샵이 가입 때 같이 만들어지므로 둘 다 있어야 한다
 * (requireOwner의 NO_OWNER_ACCOUNT와 같은 기준). 운영자는 운영자 권한(profiles.is_admin)이 있어야 한다
 */
export function hasAccountFor(
  account: Pick<CurrentAccount, 'customerId' | 'ownerId' | 'shopId' | 'isAdmin'> | null,
  mode: AccountMode,
): boolean {
  if (!account) return false;
  if (mode === 'admin') return account.isAdmin;
  return mode === 'customer'
    ? account.customerId !== null
    : Boolean(account.ownerId && account.shopId);
}
