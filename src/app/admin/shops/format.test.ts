// 입점 심사 화면 표시 모양 (A-101). 사업자등록번호·은행·업종·PG 셀러 상태·심사 기록 이름.

import { describe, expect, it } from 'vitest';

import {
  formatBusinessNumber,
  labelBank,
  labelCategory,
  labelPgSellerStatus,
  labelReviewAction,
} from './format';

describe('입점 심사 표시 모양', () => {
  it('사업자등록번호는 000-00-00000, 10자리가 아니면 그대로', () => {
    expect(formatBusinessNumber('1234567890')).toBe('123-45-67890');
    expect(formatBusinessNumber('123')).toBe('123');
  });

  it('은행은 이름으로, 목록에 없으면 코드 그대로', () => {
    expect(labelBank('088')).toBe('신한은행');
    expect(labelBank('999')).toBe('999');
  });

  it('업종·PG 셀러 상태·심사 기록은 화면 이름으로', () => {
    expect(labelCategory('hair')).toBe('미용실');
    expect(labelCategory('nail_lash')).toBe('네일·속눈썹');
    expect(labelPgSellerStatus('not_registered')).toBe('등록 전');
    expect(labelReviewAction('shop.approve')).toBe('승인');
    expect(labelReviewAction('shop.reject')).toBe('반려');
    expect(labelReviewAction('something.else')).toBe('something.else');
  });
});
