// 로그인·가입 흐름 주소와 계정 모드 규칙 (#47 1·3·8장). DB 없이 돈다.

import { describe, expect, it } from 'vitest';

import { hasAccountFor, parseAccountMode, toSwitchableMode } from './account-mode';
import type { CurrentAccount } from './current-account';
import { afterLoginPath, customerJoinPath, loginPath } from './paths';

function account(extra: Partial<CurrentAccount> = {}): CurrentAccount {
  return {
    userId: 'user-1',
    email: 'someone@test.invalid',
    mode: 'customer',
    customerId: null,
    ownerId: null,
    shopId: null,
    isAdmin: false,
    ...extra,
  };
}

describe('parseAccountMode', () => {
  it('owner는 원장님, admin은 운영자(#372), 나머지(없음·이상한 값)는 고객이다', () => {
    expect(parseAccountMode('owner')).toBe('owner');
    expect(parseAccountMode('admin')).toBe('admin');
    expect(parseAccountMode('customer')).toBe('customer');
    expect(parseAccountMode(undefined)).toBe('customer');
    expect(parseAccountMode('root')).toBe('customer');
  });

  it('로그인 화면 토글의 처음 값: 운영자로 들어와 있으면 고객(운영자는 토글에 없다)', () => {
    expect(toSwitchableMode('owner')).toBe('owner');
    expect(toSwitchableMode('admin')).toBe('customer');
    expect(toSwitchableMode(undefined)).toBe('customer');
  });
});

describe('hasAccountFor', () => {
  it('고객은 customerId, 원장님은 ownerId와 shopId가 모두 있어야 한다', () => {
    expect(hasAccountFor(null, 'customer')).toBe(false);
    expect(hasAccountFor(account({ customerId: 'c' }), 'customer')).toBe(true);
    expect(hasAccountFor(account({ customerId: 'c' }), 'owner')).toBe(false);
    expect(hasAccountFor(account({ ownerId: 'o' }), 'owner')).toBe(false);
    expect(hasAccountFor(account({ ownerId: 'o', shopId: 's' }), 'owner')).toBe(true);
  });

  it('운영자는 운영자 권한(is_admin)이 있어야 한다(#372)', () => {
    expect(hasAccountFor(account({ isAdmin: true }), 'admin')).toBe(true);
    expect(hasAccountFor(account({ customerId: 'c', ownerId: 'o', shopId: 's' }), 'admin')).toBe(
      false,
    );
  });
});

describe('loginPath·customerJoinPath', () => {
  it('토글 값과 돌아갈 주소를 붙이고, 실패 이유가 있으면 같이 붙인다', () => {
    expect(loginPath('owner', '/owner/slots')).toBe('/login?mode=owner&next=%2Fowner%2Fslots');
    expect(loginPath('customer', '/slots/a', 'login_failed')).toBe(
      '/login?mode=customer&next=%2Fslots%2Fa&error=login_failed',
    );
  });

  it('운영자는 운영자 입구(/admin/login)로, 돌아갈 주소와 실패 이유(not_admin 포함)를 붙인다(#372)', () => {
    expect(loginPath('admin', '/admin/disputes')).toBe('/admin/login?next=%2Fadmin%2Fdisputes');
    expect(loginPath('admin', undefined, 'not_admin')).toBe(
      '/admin/login?next=%2Fadmin&error=not_admin',
    );
  });

  it('다른 사이트 주소나 빈 값은 모드의 기본 주소로 바꾼다', () => {
    expect(loginPath('owner', '//evil.example')).toBe('/login?mode=owner&next=%2Fowner');
    expect(loginPath('customer', undefined)).toBe('/login?mode=customer&next=%2Fhome');
    expect(customerJoinPath('https://evil.example')).toBe('/join?next=%2Fhome');
  });
});

describe('afterLoginPath (로그인 콜백이 보낼 곳)', () => {
  it('운영자 권한이 있으면 보던 운영자 화면으로, 없으면 운영자 입구에 not_admin(#372)', () => {
    expect(afterLoginPath(account({ isAdmin: true }), 'admin', '/admin/shops')).toBe(
      '/admin/shops',
    );
    expect(afterLoginPath(account(), 'admin', '/admin/shops')).toBe(
      '/admin/login?next=%2Fadmin%2Fshops&error=not_admin',
    );
  });

  it('고객 계정이 없으면 약관 화면으로, 돌아갈 주소를 붙여서 보낸다', () => {
    expect(afterLoginPath(account(), 'customer', '/slots/a')).toBe('/join?next=%2Fslots%2Fa');
  });

  it('원장님 계정이 없으면 원장님 가입 화면으로 보낸다', () => {
    expect(afterLoginPath(account({ customerId: 'c' }), 'owner', '/owner/slots')).toBe(
      '/owner/join',
    );
  });

  it('그 모드의 계정이 있으면 보던 화면으로, 없거나 안전하지 않으면 기본 주소로', () => {
    expect(afterLoginPath(account({ customerId: 'c' }), 'customer', '/slots/a')).toBe('/slots/a');
    const owner = account({ ownerId: 'o', shopId: 's' });
    expect(afterLoginPath(owner, 'owner', '/owner/slots')).toBe('/owner/slots');
    expect(afterLoginPath(owner, 'owner', '//evil.example')).toBe('/owner');
  });
});
