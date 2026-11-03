import { describe, expect, it } from 'vitest';

import { withDirectionParticle, withObjectParticle } from './korean';

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

describe('withDirectionParticle (업종 변경 문구 조사)', () => {
  it('받침이 없거나 ㄹ 받침이면 로, 다른 받침이면 으로', () => {
    expect(withDirectionParticle('미용실')).toBe('미용실로');
    expect(withDirectionParticle('헤어')).toBe('헤어로');
    expect(withDirectionParticle('네일·속눈썹')).toBe('네일·속눈썹으로');
  });

  it('마지막 글자가 한글이 아니면 (으)로', () => {
    expect(withDirectionParticle('Nail')).toBe('Nail(으)로');
  });
});
