// 입점 심사 화면 표시 모양 (A-101). 은행·업종·PG 셀러 상태·심사 기록 이름.
// 사업자등록번호 모양은 src/lib/business-number.test.ts에서 본다(#205).

import { describe, expect, it } from 'vitest';

import {
  agreedCancelReasonText,
  defaultShopSort,
  labelPgSellerStatus,
  labelReviewAction,
  ntsCheckText,
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

  it('심사 기록의 승인·반려 말고 다른 운영자 처리도 이름으로(운영자 기록 화면과 같은 이름)', () => {
    expect(labelReviewAction('shop.publish_pause')).toBe('게시 멈춤');
    expect(labelReviewAction('shop.publish_resume')).toBe('게시 다시 열기');
    expect(labelReviewAction('shop.business_update')).toBe('사업자 정보 수정');
    expect(labelReviewAction('settlement.hold')).toBe('정산 보류');
    expect(labelReviewAction('settlement.release')).toBe('정산 보류 풀기');
  });
});

describe('합의 후 취소 사유 표시 (X-208)', () => {
  it('정해진 사유는 이름만, 기타는 원장님이 적은 내용을 괄호로 붙인다', () => {
    expect(agreedCancelReasonText('style_mismatch', null)).toBe(
      '원하는 시술이 예약한 서비스와 달라요',
    );
    expect(agreedCancelReasonText('other', '손님 일정이 바뀌었대요')).toBe(
      '기타(손님 일정이 바뀌었대요)',
    );
  });

  it('기타인데 내용이 없으면 "기타"만, 정해진 사유에 내용이 있어도 붙이지 않는다', () => {
    expect(agreedCancelReasonText('other', null)).toBe('기타');
    expect(agreedCancelReasonText('other', '')).toBe('기타');
    expect(agreedCancelReasonText('customer_declined', '붙지 않는 내용')).toBe(
      '손님이 시술을 원하지 않아요',
    );
  });
});

describe('국세청 진위확인 결과 표시 (#208)', () => {
  const AT = new Date('2026-11-22T05:30:00Z');

  it('맞음·확인 못 함은 확인한 시각을 붙이고, 비어 있으면 확인 안 함', () => {
    expect(ntsCheckText('verified', AT)).toBe('국세청 정보와 맞음 · 2026-11-22 14:30 확인');
    expect(ntsCheckText('unavailable', AT)).toBe(
      '확인 못 함(국세청이 응답하지 않았어요) · 2026-11-22 14:30 확인',
    );
    expect(ntsCheckText(null, null)).toBe('확인 안 함');
  });
});
