import { describe, expect, it } from 'vitest';

import { parseLoginMode, resolveNextPath, safeNextPath } from './login-params';

describe('parseLoginMode', () => {
  it('owner만 원장님, 나머지는 모두 고객', () => {
    expect(parseLoginMode('owner')).toBe('owner');
    expect(parseLoginMode(['owner', 'customer'])).toBe('owner');
    for (const value of ['customer', 'OWNER', 'admin', '', undefined]) {
      expect(parseLoginMode(value)).toBe('customer');
    }
  });
});

describe('safeNextPath', () => {
  it('우리 사이트 안 주소는 그대로 받는다', () => {
    expect(safeNextPath('/')).toBe('/');
    expect(safeNextPath('/slots/abc?from=map#top')).toBe('/slots/abc?from=map#top');
    expect(safeNextPath('/owner/join')).toBe('/owner/join');
    // 인코딩된 글자(%0a)는 주소 안의 글자일 뿐이라 안전하다
    expect(safeNextPath('/%0a')).toBe('/%0a');
  });

  it('경로 안의 ../ 는 정리해서 돌려준다', () => {
    expect(safeNextPath('/owner/../reservations')).toBe('/reservations');
  });

  it('다른 사이트로 나가는 주소는 거절한다(오픈 리다이렉트)', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '\\\\evil.example',
      'javascript:alert(1)',
      'slots/abc',
      '/\tevil',
      '',
      undefined,
    ]) {
      expect(safeNextPath(value)).toBeNull();
    }
  });

  it('값이 여러 개면 첫 번째만 본다', () => {
    expect(safeNextPath(['/reservations', 'https://evil.example'])).toBe('/reservations');
  });
});

describe('resolveNextPath', () => {
  it('next가 없거나 안전하지 않으면 모드별 기본 주소', () => {
    expect(resolveNextPath(undefined, 'customer')).toBe('/');
    expect(resolveNextPath(undefined, 'owner')).toBe('/owner');
    expect(resolveNextPath('//evil.example', 'owner')).toBe('/owner');
  });

  it('안전한 next는 그대로', () => {
    expect(resolveNextPath('/slots/abc', 'customer')).toBe('/slots/abc');
  });
});
