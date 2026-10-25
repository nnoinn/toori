import { describe, expect, it } from 'vitest';

import { parseLoginMode, readNextParam } from './login-params';

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
