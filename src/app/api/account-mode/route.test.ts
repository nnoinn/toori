// 서비스 워커가 지금 계정을 묻는 주소 (W16, #131). 쿠키 값대로 답하고, 저장해 두지 못하게 하는지 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'account_mode' && state.cookie ? { value: state.cookie } : undefined,
  }),
}));

const { GET } = await import('./route');

beforeEach(() => {
  state.cookie = undefined;
});

describe('GET /api/account-mode', () => {
  it.each([
    ['owner', 'owner'],
    ['customer', 'customer'],
    [undefined, 'customer'],
    ['이상한 값', 'customer'],
  ])('쿠키가 %s면 %s', async (cookie, mode) => {
    state.cookie = cookie;
    const response = await GET();
    expect(await response.json()).toEqual({ mode });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
