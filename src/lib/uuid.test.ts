import { describe, expect, it } from 'vitest';

import { isUuid } from './uuid';

describe('isUuid', () => {
  it('uuid 모양이면 true', () => {
    expect(isUuid(crypto.randomUUID())).toBe(true);
  });

  it('모양이 틀리거나 문자열이 아니면 false', () => {
    for (const value of [
      '',
      'not-a-uuid',
      crypto.randomUUID().replaceAll('-', ''),
      null,
      undefined,
      123,
    ]) {
      expect(isUuid(value)).toBe(false);
    }
  });
});
