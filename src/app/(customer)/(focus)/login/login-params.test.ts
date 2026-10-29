import { describe, expect, it } from 'vitest';

import type { LoginError } from '@/server/auth/paths';

import {
  LOGIN_ERROR_MESSAGES,
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
