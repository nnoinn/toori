// 입점 심사 화면 표시 모양 (A-101). 은행·업종·PG 셀러 상태·심사 기록 이름.
// 사업자등록번호 모양은 src/lib/business-number.test.ts에서 본다(#205).

import { describe, expect, it } from 'vitest';

import { labelPgSellerStatus, labelReviewAction } from './format';

describe('입점 심사 표시 모양', () => {
  it('은행은 이름으로, 목록에 없으면 코드 그대로', () => {});

  it('PG 셀러 상태·심사 기록은 화면 이름으로', () => {
    expect(labelPgSellerStatus('not_registered')).toBe('등록 전');
    expect(labelReviewAction('shop.approve')).toBe('승인');
    expect(labelReviewAction('shop.reject')).toBe('반려');
    expect(labelReviewAction('something.else')).toBe('something.else');
  });
});
