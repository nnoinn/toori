import { describe, expect, it } from 'vitest';

import { normalizePhone } from './phone';

describe('normalizePhone', () => {
  it('휴대폰 번호를 하이픈 넣은 모양으로 맞춘다', () => {
    expect(normalizePhone('01012345678', 'mobile')).toBe('010-1234-5678');
    expect(normalizePhone('010-1234-5678', 'mobile')).toBe('010-1234-5678');
    expect(normalizePhone(' 010 1234 5678 ', 'mobile')).toBe('010-1234-5678');
    expect(normalizePhone('0111234567', 'mobile')).toBe('011-123-4567');
    expect(normalizePhone('01912345678', 'mobile')).toBe('019-1234-5678');
  });

  it('지역번호·070·안심번호·대표번호는 any에서만 받는다', () => {
    expect(normalizePhone('0212345678')).toBe('02-1234-5678');
    expect(normalizePhone('021234567')).toBe('02-123-4567');
    expect(normalizePhone('0311234567')).toBe('031-123-4567');
    expect(normalizePhone('031-1234-5678')).toBe('031-1234-5678');
    expect(normalizePhone('07012345678')).toBe('070-1234-5678');
    expect(normalizePhone('050712345678')).toBe('0507-1234-5678');
    expect(normalizePhone('05051234567')).toBe('0505-123-4567');
    expect(normalizePhone('15881234')).toBe('1588-1234');
    expect(normalizePhone('01012345678')).toBe('010-1234-5678');

    expect(normalizePhone('0311234567', 'mobile')).toBeNull();
    expect(normalizePhone('050712345678', 'mobile')).toBeNull();
    expect(normalizePhone('15881234', 'mobile')).toBeNull();
  });

  it('번호 모양이 아니면 null', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('0101234567')).toBeNull(); // 010은 가운데가 4자리
    expect(normalizePhone('010123456789')).toBeNull();
    expect(normalizePhone('0301234567')).toBeNull(); // 없는 지역번호
    expect(normalizePhone('000-0000-0000')).toBeNull();
    expect(normalizePhone('+82 10-1234-5678')).toBeNull();
    expect(normalizePhone('010.1234.5678')).toBeNull();
    expect(normalizePhone('010-1234-567a')).toBeNull();
  });
});
