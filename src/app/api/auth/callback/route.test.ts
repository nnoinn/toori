// 로그인 콜백이 #47 3장대로 보내는지 확인한다. Supabase·DB·쿠키는 가짜로 바꿔서 DB 없이 돈다.

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentAccount } from '@/server/auth/current-account';

import { GET } from './route';

const state = vi.hoisted(() => ({
  exchange: vi.fn(),
  signOut: vi.fn(),
  ensureProfile: vi.fn(),
  account: null as Partial<CurrentAccount> | null,
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: state.cookieSet, delete: state.cookieDelete }),
}));
vi.mock('@/db', () => ({ getDb: () => ({}) }));
vi.mock('@/server/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { exchangeCodeForSession: state.exchange, signOut: state.signOut },
  }),
}));
vi.mock('@/server/auth/current-account', () => ({
  ensureProfile: state.ensureProfile,
  loadAccount: async () => state.account,
}));

const callback = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/api/auth/callback?${query}`));

const loggedIn = (email: string | null = 'someone@test.invalid') =>
  state.exchange.mockResolvedValue({ data: { user: { id: 'user-1', email } }, error: null });

beforeEach(() => {
  vi.clearAllMocks();
  state.account = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/auth/callback', () => {
  it('code가 없으면(취소·오류) 로그인 화면으로 돌려보내고 실패 이유를 붙인다', async () => {
    const res = await callback('mode=owner&next=%2Fowner%2Fslots&error=access_denied');
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/login?mode=owner&next=%2Fowner%2Fslots&error=login_failed',
    );
    expect(state.exchange).not.toHaveBeenCalled();
  });

  it('세션을 만들지 못하면 로그인 화면으로 돌려보낸다', async () => {
    state.exchange.mockResolvedValue({ data: { user: null }, error: new Error('bad code') });
    const res = await callback('code=abc&mode=customer');
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/login?mode=customer&next=%2Fhome&error=login_failed',
    );
    expect(state.ensureProfile).not.toHaveBeenCalled();
  });

  it('이메일을 받지 못하면 로그인을 끝내고 이메일 동의가 필요하다고 알린다', async () => {
    loggedIn(null);
    const res = await callback('code=abc&mode=customer&next=%2Fslots%2Fa');
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/login?mode=customer&next=%2Fslots%2Fa&error=email_required',
    );
  });

  it('첫 로그인이면 profiles를 만들고, 고른 모드를 쿠키에 저장하고, 고객 계정이 없으면 약관 화면으로', async () => {
    loggedIn();
    const res = await callback('code=abc&mode=customer&next=%2Fslots%2Fa');
    expect(state.ensureProfile).toHaveBeenCalledWith({}, 'user-1', 'someone@test.invalid');
    expect(state.cookieSet).toHaveBeenCalledWith(
      'account_mode',
      'customer',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.headers.get('location')).toBe('http://localhost:3000/join?next=%2Fslots%2Fa');
  });

  it('원장님 계정이 없으면 원장님 가입 화면으로', async () => {
    loggedIn();
    state.account = { customerId: 'customer-1', ownerId: null, shopId: null };
    const res = await callback('code=abc&mode=owner');
    expect(res.headers.get('location')).toBe('http://localhost:3000/owner/join');
  });

  it('그 모드의 계정이 있으면 보던 화면으로, 다른 사이트 주소면 기본 주소로', async () => {
    loggedIn();
    state.account = { customerId: null, ownerId: 'owner-1', shopId: 'shop-1' };
    let res = await callback('code=abc&mode=owner&next=%2Fowner%2Fslots');
    expect(res.headers.get('location')).toBe('http://localhost:3000/owner/slots');

    res = await callback('code=abc&mode=owner&next=%2F%2Fevil.example');
    expect(res.headers.get('location')).toBe('http://localhost:3000/owner');
  });

  it('운영자 입구로 들어온 관리자는 운영자 모드로 보던 운영자 화면에 간다(#372)', async () => {
    loggedIn();
    state.account = { isAdmin: true, customerId: null, ownerId: null, shopId: null };
    const res = await callback('code=abc&mode=admin&next=%2Fadmin%2Fdisputes');
    expect(state.cookieSet).toHaveBeenCalledWith(
      'account_mode',
      'admin',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(state.signOut).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin/disputes');
  });

  it('운영자 입구로 들어왔는데 관리자가 아니면 바로 로그아웃시키고 운영자 입구에 not_admin을 알린다(#372)', async () => {
    loggedIn();
    // 고객·원장님 계정이 있어도 관리자가 아니면 운영자로 들어오지 못한다
    state.account = { isAdmin: false, customerId: 'customer-1', ownerId: 'owner-1', shopId: 's' };
    const res = await callback('code=abc&mode=admin&next=%2Fadmin%2Fshops');
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(state.cookieDelete).toHaveBeenCalledWith('account_mode');
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/admin/login?next=%2Fadmin%2Fshops&error=not_admin',
    );
  });

  describe('최근 로그인 방식 기억하기 (AUTH-14)', () => {
    /** 최근 로그인 쿠키를 적은 값들 */
    const recentWrites = () =>
      state.cookieSet.mock.calls.filter(([name]) => name === 'recent_login_provider');

    it('로그인을 마치면 누른 간편 로그인을 이 기기의 최근 로그인으로 1년 동안 기억한다', async () => {
      loggedIn();
      state.account = { customerId: 'customer-1', ownerId: null, shopId: null };
      const res = await callback('code=abc&mode=customer&next=%2Fslots%2Fa&provider=naver');
      expect(recentWrites()).toEqual([
        [
          'recent_login_provider',
          'naver',
          expect.objectContaining({ httpOnly: true, path: '/', maxAge: 365 * 24 * 60 * 60 }),
        ],
      ]);
      expect(res.headers.get('location')).toBe('http://localhost:3000/slots/a');
    });

    it('가입 화면으로 가는 첫 로그인도 기억한다', async () => {
      loggedIn();
      await callback('code=abc&mode=owner&provider=google');
      expect(recentWrites()).toEqual([['recent_login_provider', 'google', expect.anything()]]);
    });

    it.each([
      ['방식이 없으면', 'code=abc&mode=customer'],
      ['모르는 방식이면', 'code=abc&mode=customer&provider=toss'],
    ])('%s 기억하지 않는다', async (_, query) => {
      loggedIn();
      state.account = { customerId: 'customer-1', ownerId: null, shopId: null };
      await callback(query);
      expect(recentWrites()).toEqual([]);
    });

    it('로그인을 마치지 못하면(취소·세션 실패·이메일 없음·운영자 아님) 기억하지 않는다', async () => {
      await callback('mode=customer&provider=kakao&error=access_denied');

      state.exchange.mockResolvedValue({ data: { user: null }, error: new Error('bad code') });
      await callback('code=abc&mode=customer&provider=kakao');

      loggedIn(null);
      await callback('code=abc&mode=customer&provider=kakao');

      loggedIn();
      state.account = { isAdmin: false, customerId: 'customer-1', ownerId: null, shopId: null };
      await callback('code=abc&mode=admin&provider=kakao');

      expect(recentWrites()).toEqual([]);
    });
  });
});
