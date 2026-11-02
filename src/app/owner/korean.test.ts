import { describe, expect, it } from 'vitest';

import { withObjectParticle } from './korean';

describe('withObjectParticle (빈 칸 문구 조사)', () => {
  it('받침이 있으면 을, 없으면 를', () => {
    expect(withObjectParticle('이름')).toBe('이름을');
    expect(withObjectParticle('대표자명')).toBe('대표자명을');
    expect(withObjectParticle('샵 이름')).toBe('샵 이름을');
    expect(withObjectParticle('상호')).toBe('상호를');
    expect(withObjectParticle('예금주')).toBe('예금주를');
    expect(withObjectParticle('커트')).toBe('커트를');
  });

  it('마지막 글자가 한글이 아니면 을(를)', () => {
    expect(withObjectParticle('Cut')).toBe('Cut을(를)');
    expect(withObjectParticle('펌 2')).toBe('펌 2을(를)');
    expect(withObjectParticle('')).toBe('을(를)');
  });
});
