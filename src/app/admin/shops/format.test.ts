// 입점 심사 화면 표시 모양 (A-101). 은행·업종·PG 셀러 상태·심사 기록 이름.
// 사업자등록번호 모양은 src/lib/business-number.test.ts에서 본다(#205).

import { describe, expect, it } from 'vitest';

import {
  defaultShopSort,
  labelPgSellerStatus,
  labelReviewAction,
  shopsHref,
  toShopSort,
} from './format';

describe('입점 심사 목록 정렬 (#360 1번)', () => {
  it('거르기마다 기본 정렬은 고르기 전 순서와 같다: 승인 대기는 오래된 신청, 전체는 최신 신청, 승인·반려는 최신 심사', () => {
    expect(defaultShopSort('pending')).toBe('applied_old');
    expect(defaultShopSort('all')).toBe('applied_new');
    expect(defaultShopSort('approved')).toBe('reviewed_new');
    expect(defaultShopSort('rejected')).toBe('reviewed_new');
  });

  it('주소의 정렬 값이 없거나 모르는 값이면 null(기본 정렬을 쓴다)', () => {
    expect(toShopSort('applied_new')).toBe('applied_new');
    expect(toShopSort(undefined)).toBeNull();
    expect(toShopSort('started_at')).toBeNull();
  });

  it('목록 주소에는 기본 거르기와 그 거르기의 기본 정렬을 넣지 않는다', () => {
    expect(shopsHref({ filter: 'pending' })).toBe('/admin/shops');
    expect(shopsHref({ filter: 'pending', sort: 'applied_old' })).toBe('/admin/shops');
    expect(shopsHref({ filter: 'pending', sort: 'applied_new' })).toBe(
      '/admin/shops?sort=applied_new',
    );
    expect(shopsHref({ filter: 'approved', sort: 'reviewed_new' })).toBe(
      '/admin/shops?status=approved',
    );
    expect(shopsHref({ filter: 'all', sort: null })).toBe('/admin/shops?status=all');
    expect(shopsHref({ filter: 'all', sort: 'applied_old' })).toBe(
      '/admin/shops?status=all&sort=applied_old',
    );
  });
});

describe('입점 심사 표시 모양', () => {
  it('PG 셀러 상태·심사 기록은 화면 이름으로', () => {
    expect(labelPgSellerStatus('not_registered')).toBe('등록 전');
    expect(labelReviewAction('shop.approve')).toBe('승인');
    expect(labelReviewAction('shop.reject')).toBe('반려');
    expect(labelReviewAction('something.else')).toBe('something.else');
  });
});
