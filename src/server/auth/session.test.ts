// 로그인 시작·로그아웃·계정 전환 (#47 3장). Supabase·쿠키·화면 이동은 가짜로 바꿔서 DB 없이 돈다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentAccount } from './current-account';
import { signInWithProvider, signOut, switchAccountMode } from './session';

const state = vi.hoisted(() => ({
  origin: 'http://localhost:3000' as string | null,
  userId: null as string | null,
  account: null as Partial<CurrentAccount> | null,
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'origin' ? state.origin : null) }),
  cookies: async () => ({ set: state.cookieSet, delete: state.cookieDelete }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/server/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInWithOAuth: state.signInWithOAuth, signOut: state.signOut },
  }),
}));
vi.mock('@/db', () => ({ getDb: () => ({}) }));
vi.mock('./current-account', () => ({
  getSessionUserId: async () => state.userId,
  loadAccount: async () => state.account,
}));

beforeEach(() => {
  state.origin = 'http://localhost:3000';
  state.userId = null;
  state.account = null;
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('signInWithProvider', () => {
  it('고른 모드와 돌아갈 주소를 콜백 주소에 붙여 카카오·구글 로그인 화면으로 보낸다', async () => {
    state.signInWithOAuth.mockResolvedValue({ data: { url: 'https://kauth.example/a' } });

    await expect(
      signInWithProvider({ provider: 'kakao', mode: 'owner', next: '/owner/slots' }),
    ).rejects.toThrow('redirect:https://kauth.example/a');
    expect(state.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'kakao',
      options: {
        redirectTo: 'http://localhost:3000/api/auth/callback?mode=owner&next=%2Fowner%2Fslots',
      },
    });
  });

  it('다른 사이트 주소는 돌아갈 주소로 쓰지 않는다(고객 기본 /)', async () => {
    state.signInWithOAuth.mockResolvedValue({ data: { url: 'https://accounts.example/b' } });

    await expect(
      signInWithProvider({ provider: 'google', mode: 'customer', next: '//evil.example' }),
    ).rejects.toThrow('redirect:');
    expect(state.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe(
      'http://localhost:3000/api/auth/callback?mode=customer&next=%2F',
    );
  });

  it('지원하지 않는 로그인 방법이면 INVALID_INPUT', async () => {
    const result = await signInWithProvider({
      provider: 'naver' as 'kakao',
      mode: 'customer',
    });
    expect(result.ok || result.error.code).toBe('INVALID_INPUT');
    expect(state.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('로그인을 시작하지 못하면 LOGIN_UNAVAILABLE', async () => {
    state.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: new Error('down') });
    const result = await signInWithProvider({ provider: 'google', mode: 'customer' });
    expect(result.ok || result.error.code).toBe('LOGIN_UNAVAILABLE');

    state.origin = null;
    const noOrigin = await signInWithProvider({ provider: 'google', mode: 'customer' });
    expect(noOrigin.ok || noOrigin.error.code).toBe('LOGIN_UNAVAILABLE');
  });
});

describe('signOut', () => {
  it('이 브라우저의 로그인만 끝내고 계정 모드 쿠키를 지운다', async () => {
    state.signOut.mockResolvedValue({ error: null });
    expect(await signOut()).toEqual({ ok: true, data: null });
    expect(state.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(state.cookieDelete).toHaveBeenCalledWith('account_mode');
  });

  it('실패해도 계정 모드 쿠키는 지우고 SIGN_OUT_FAILED를 돌려준다', async () => {
    state.signOut.mockResolvedValue({ error: new Error('down') });
    const result = await signOut();
    expect(result.ok || result.error.code).toBe('SIGN_OUT_FAILED');
    expect(state.cookieDelete).toHaveBeenCalledWith('account_mode');
  });
});

describe('switchAccountMode', () => {
  it('로그인하지 않았으면 UNAUTHENTICATED이고 쿠키를 바꾸지 않는다', async () => {
    const result = await switchAccountMode('owner');
    expect(result.ok || result.error.code).toBe('UNAUTHENTICATED');
    expect(state.cookieSet).not.toHaveBeenCalled();
  });

  it('쿠키를 바꾸고 그 모드의 계정이 있는지 알려 준다', async () => {
    state.userId = 'user-1';
    state.account = { customerId: 'customer-1', ownerId: null, shopId: null };

    expect(await switchAccountMode('owner')).toEqual({
      ok: true,
      data: { mode: 'owner', hasAccount: false },
    });
    expect(state.cookieSet).toHaveBeenCalledWith(
      'account_mode',
      'owner',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(await switchAccountMode('customer')).toEqual({
      ok: true,
      data: { mode: 'customer', hasAccount: true },
    });
  });

  it('이상한 모드 값이면 INVALID_INPUT', async () => {
    state.userId = 'user-1';
    const result = await switchAccountMode('admin' as 'owner');
    expect(result.ok || result.error.code).toBe('INVALID_INPUT');
  });
});
