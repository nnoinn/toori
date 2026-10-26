import { describe, expect, it } from 'vitest';

import { safeNextPath } from './safe-next';

describe('safeNextPath', () => {
  it('우리 사이트 안 주소는 그대로 통과한다', () => {
    expect(safeNextPath('/slots/abc', '/')).toBe('/slots/abc');
    expect(safeNextPath('/owner/slots?tab=published#top', '/owner')).toBe(
      '/owner/slots?tab=published#top',
    );
    expect(safeNextPath('/', '/owner')).toBe('/');
  });

  it('비었거나 문자열이 아니면 fallback', () => {
    expect(safeNextPath(undefined, '/')).toBe('/');
    expect(safeNextPath(null, '/owner')).toBe('/owner');
    expect(safeNextPath('', '/')).toBe('/');
  });

  it('다른 사이트로 가는 주소는 fallback', () => {
    for (const bad of [
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      '/\n/evil.com',
      '/slots\\..\\..\\evil',
      'javascript:alert(1)',
      'evil.com',
      ' /slots',
    ]) {
      expect(safeNextPath(bad, '/'), JSON.stringify(bad)).toBe('/');
    }
  });

  it('너무 긴 주소는 fallback', () => {
    expect(safeNextPath(`/${'a'.repeat(3000)}`, '/')).toBe('/');
  });

  it('점(..)은 정리하되 우리 사이트 안에 머문다', () => {
    expect(safeNextPath('/owner/../slots/abc', '/')).toBe('/slots/abc');
    expect(safeNextPath('/%2F%2Fevil.com', '/')).toBe('/%2F%2Fevil.com');
  });

  it('점을 정리한 결과가 //로 시작하면 fallback (#89)', () => {
    for (const bad of [
      '/..//evil.example',
      '/.//evil.example',
      '/a/..//evil.example',
      '/%2e%2e//evil.example',
      '/%2E//evil.example',
    ]) {
      expect(safeNextPath(bad, '/'), JSON.stringify(bad)).toBe('/');
    }
    // '//'가 맨 앞이 아니면 우리 사이트 안이라 그대로 둔다
    expect(safeNextPath('/a//b', '/')).toBe('/a//b');
  });
});
