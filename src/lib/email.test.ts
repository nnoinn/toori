import { describe, expect, it } from 'vitest';

import { maskEmail } from './email';

describe('maskEmail (#360 4번)', () => {
  it('앞부분은 두 글자만 남기고 도메인은 그대로 둔다', () => {
    expect(maskEmail('abcdef@gmail.com')).toBe('ab****@gmail.com');
    expect(maskEmail('abc@naver.com')).toBe('ab****@naver.com');
  });

  it('앞부분이 두 글자 이하면 첫 글자만, 없거나 모양이 아니면 가린 값', () => {
    expect(maskEmail('ab@kakao.com')).toBe('a****@kakao.com');
    expect(maskEmail('a@kakao.com')).toBe('a****@kakao.com');
    expect(maskEmail('@kakao.com')).toBe('****');
    expect(maskEmail('not-an-email')).toBe('****');
    expect(maskEmail(null)).toBe('-');
  });
});
