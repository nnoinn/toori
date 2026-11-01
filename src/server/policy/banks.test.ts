import { describe, expect, it } from 'vitest';

import { bankName } from './banks';

describe('bankName', () => {
  it('은행 코드의 이름, 목록에 없으면 코드 그대로', () => {
    expect(bankName('088')).toBe('신한은행');
    expect(bankName('999')).toBe('999');
  });
});
