import { describe, expect, it } from 'vitest';

import type { LoginError } from '@/server/auth/paths';

import {
  isPathForMode,
  LOGIN_ERROR_MESSAGES,
  nextForMode,
  parseLoginError,
  parseLoginMode,
  readNextParam,
} from './login-params';

describe('parseLoginMode', () => {
  it('owner만 원장님, 나머지는 모두 고객', () => {
    expect(parseLoginMode('owner')).toBe('owner');
    expect(parseLoginMode(['owner', 'customer'])).toBe('owner');
    for (const value of ['customer', 'OWNER', 'admin', '', undefined]) {
      expect(parseLoginMode(value)).toBe('customer');
    }
  });
});

// 안전한 주소인지는 공통 함수(src/lib/safe-next.ts)가 정하고 그 테스트가 따로 있다. 여기서는 연결만 본다
describe('readNextParam', () => {
  it('없으면 null(모드별 기본 주소로)', () => {
    expect(readNextParam(undefined)).toBeNull();
    expect(readNextParam('')).toBeNull();
  });

  it('우리 사이트 안 주소는 그대로', () => {
    expect(readNextParam('/slots/abc?from=map')).toBe('/slots/abc?from=map');
    expect(readNextParam(['/reservations', 'https://evil.example'])).toBe('/reservations');
  });

  it('다른 사이트 주소는 null', () => {
    expect(readNextParam('https://evil.example')).toBeNull();
    expect(readNextParam('//evil.example')).toBeNull();
  });
});

describe('로그인 실패 이유', () => {
  it('콜백이 보내는 두 가지만 문구로 바꾼다', () => {
    expect(parseLoginError('login_failed')).toBe('login_failed');
    expect(parseLoginError(['email_required', 'login_failed'])).toBe('email_required');
    for (const value of [undefined, '', 'unknown', 'toString', '__proto__', 'constructor']) {
      expect(parseLoginError(value)).toBeNull();
    }
  });

  it('서버의 실패 이유(LoginError)마다 화면 문구가 있다', () => {
    // 서버에 실패 이유가 더해지면 여기서 타입 오류가 나서 문구를 빠뜨리지 않는다
    const messages: Record<LoginError, string> = LOGIN_ERROR_MESSAGES;
    expect(Object.keys(messages).sort()).toEqual(['email_required', 'login_failed']);
    for (const text of Object.values(messages)) expect(text.length).toBeGreaterThan(0);
  });
});

describe('로그인하고 갈 곳: 고른 모드와 next가 맞지 않으면 그 모드의 기본 주소 (#207)', () => {
  it('고객 화면에서 넘어와 원장님을 고르면 /owner', () => {
    expect(nextForMode('owner', '/me')).toBe('/owner');
    expect(nextForMode('owner', '/slots/abc')).toBe('/owner');
    expect(nextForMode('owner', '/')).toBe('/owner');
  });

  it('원장님·운영자 화면에서 넘어와 고객을 고르면 /', () => {
    expect(nextForMode('customer', '/owner')).toBe('/');
    expect(nextForMode('customer', '/owner/slots/new')).toBe('/');
    expect(nextForMode('customer', '/admin/shops')).toBe('/');
  });

  it('맞으면 보던 화면 그대로', () => {
    expect(nextForMode('customer', '/me')).toBe('/me');
    expect(nextForMode('customer', '/slots/abc?x=1')).toBe('/slots/abc?x=1');
    expect(nextForMode('owner', '/owner/slots/new')).toBe('/owner/slots/new');
    expect(nextForMode('owner', '/owner?tab=1')).toBe('/owner?tab=1');
  });

  it('next가 없으면 그 모드의 기본 주소', () => {
    expect(nextForMode('customer', null)).toBe('/');
    expect(nextForMode('owner', null)).toBe('/owner');
  });

  it('/owner로 시작하는 다른 이름은 원장님 화면이 아니다', () => {
    expect(isPathForMode('/owners', 'owner')).toBe(false);
    expect(isPathForMode('/owners', 'customer')).toBe(true);
    expect(isPathForMode('/administrator', 'customer')).toBe(true);
  });
});
