// 같은 사람 표시(#154, identity.ts). 테스트는 vitest 설정의 가짜 키를 쓴다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { identityHashOf, identityHashRequired } from './identity';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('identityHashOf', () => {
  it('16진수 64자리이고, 앞뒤 공백과 대소문자가 달라도 같은 이메일이면 같은 값이다', () => {
    const hash = identityHashOf('Kim@Example.com');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(identityHashOf('  kim@example.com ')).toBe(hash);
    expect(identityHashOf('lee@example.com')).not.toBe(hash);
    // 이메일이 그대로 들어 있지 않다
    expect(hash).not.toContain('kim');
  });

  it('키가 다르면 값도 다르다(키 없이는 같은 값을 만들 수 없다)', () => {
    const hash = identityHashOf('kim@example.com');
    vi.stubEnv('ACCOUNT_IDENTITY_KEY', 'f'.repeat(64));
    expect(identityHashOf('kim@example.com')).not.toBe(hash);
  });

  it('이메일이 비었거나 키가 없거나 모양이 틀리면 null(틀린 키는 값 없이 경고만)', () => {
    expect(identityHashOf(null)).toBeNull();
    expect(identityHashOf('   ')).toBeNull();
    vi.stubEnv('ACCOUNT_IDENTITY_KEY', '');
    expect(identityHashOf('kim@example.com')).toBeNull();
    vi.stubEnv('ACCOUNT_IDENTITY_KEY', 'not-hex-key');
    expect(identityHashOf('kim@example.com')).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      '[identity] ACCOUNT_IDENTITY_KEY가 16진수 64자리(32바이트)가 아니에요',
    );
  });
});

describe('identityHashRequired', () => {
  it('운영 배포(VERCEL_ENV=production)에서만 키가 꼭 있어야 한다(11/24 결정)', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(identityHashRequired()).toBe(true);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(identityHashRequired()).toBe(false);
    vi.stubEnv('VERCEL_ENV', '');
    expect(identityHashRequired()).toBe(false);
  });
});
