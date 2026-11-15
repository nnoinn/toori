// proxy 1차 확인 규칙 (#47 3장). DB 없이 돈다.

import { describe, expect, it } from 'vitest';

import { decideProxy } from './proxy-rules';

const visit = (
  pathname: string,
  loggedIn: boolean,
  mode: 'customer' | 'owner' | 'admin',
  search = '',
) => decideProxy({ pathname, search, loggedIn, mode });

describe('원장님 화면(/owner)', () => {
  it('원장님 모드로 로그인했으면 통과한다', () => {
    expect(visit('/owner', true, 'owner')).toEqual({ type: 'next' });
    expect(visit('/owner/slots/abc', true, 'owner')).toEqual({ type: 'next' });
  });

  it('로그인하지 않았거나 고객 모드면 원장님 토글로 로그인 화면에 보내고, 보던 주소를 붙인다', () => {
    expect(visit('/owner/slots', false, 'customer', '?tab=today')).toEqual({
      type: 'redirect',
      to: '/login?mode=owner&next=%2Fowner%2Fslots%3Ftab%3Dtoday',
    });
    expect(visit('/owner', true, 'customer')).toEqual({
      type: 'redirect',
      to: '/login?mode=owner&next=%2Fowner',
    });
  });

  it('/owner로 시작하지만 다른 주소(/ownerx)는 원장님 화면이 아니다', () => {
    expect(visit('/ownerx', false, 'customer')).toEqual({ type: 'next' });
  });
});

describe('원장님 가입(/owner/join)', () => {
  it('원장님 모드로 로그인했으면 원장님 계정이 없어도 통과한다', () => {
    expect(visit('/owner/join', true, 'owner')).toEqual({ type: 'next' });
  });

  it('로그인하지 않았거나 고객 모드면 원장님 토글로 로그인 화면에 보낸다(돌아올 곳은 /owner/join)', () => {
    const toLogin = { type: 'redirect', to: '/login?mode=owner&next=%2Fowner%2Fjoin' };
    expect(visit('/owner/join', false, 'customer')).toEqual(toLogin);
    expect(visit('/owner/join', true, 'customer')).toEqual(toLogin);
  });
});

describe('운영자 화면(/admin, #372)', () => {
  it('운영자 모드면 통과하고(운영자 권한은 ensureAdminPage가 본다), 아니면 고객·원장님으로 들어와 있어도 운영자 입구로 보낸다', () => {
    expect(visit('/admin/shops', true, 'admin')).toEqual({ type: 'next' });
    expect(visit('/admin/shops', true, 'owner')).toEqual({
      type: 'redirect',
      to: '/admin/login?next=%2Fadmin%2Fshops',
    });
    expect(visit('/admin', true, 'customer')).toEqual({
      type: 'redirect',
      to: '/admin/login?next=%2Fadmin',
    });
    expect(visit('/admin/disputes', false, 'customer')).toEqual({
      type: 'redirect',
      to: '/admin/login?next=%2Fadmin%2Fdisputes',
    });
  });

  it('운영자 입구는 누구나 열고, 이미 운영자로 들어와 있으면 운영자 화면으로 보낸다', () => {
    expect(visit('/admin/login', false, 'customer')).toEqual({ type: 'next' });
    expect(visit('/admin/login', true, 'owner')).toEqual({ type: 'next' });
    expect(visit('/admin/login', true, 'admin')).toEqual({ type: 'redirect', to: '/admin' });
  });
});

describe('그 밖의 화면', () => {
  it('고객 화면은 로그인 여부와 상관없이 통과한다(로그인이 필요한 화면은 ensureCustomerPage가 막는다)', () => {
    expect(visit('/', false, 'customer')).toEqual({ type: 'next' });
    expect(visit('/reservations', false, 'customer')).toEqual({ type: 'next' });
    expect(visit('/login', true, 'owner')).toEqual({ type: 'next' });
  });
});
