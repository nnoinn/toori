// 운영자 정산 관리 화면의 탭·정렬·주소·지급일 칸 (A-105).

import { describe, expect, it } from 'vitest';

import { SETTLEMENT_STATUSES } from '@/db/schema/settlements';

import {
  defaultSettlementSort,
  SETTLEMENT_STATUS_LABELS,
  settlementsHref,
  STATEMENT_STATUS_LABELS,
  statementHref,
  toPayoutDate,
  toSettlementFilter,
  toSettlementSort,
} from './format';

describe('탭과 정렬', () => {
  it('모르는 탭이면 지급 전(기본), 모르는 정렬이면 null(그 탭의 기본 정렬)', () => {
    expect(toSettlementFilter(undefined)).toBe('pending');
    expect(toSettlementFilter('failed')).toBe('failed');
    expect(toSettlementFilter('unknown')).toBe('pending');
    expect(toSettlementSort('amount_high')).toBe('amount_high');
    expect(toSettlementSort('x')).toBeNull();
  });

  it('끝나지 않은 것(지급 전·요청·실패)은 오래된 지급일부터, 지급 완료·전체는 최근 지급일부터', () => {
    expect(defaultSettlementSort('pending')).toBe('payout_old');
    expect(defaultSettlementSort('requested')).toBe('payout_old');
    expect(defaultSettlementSort('failed')).toBe('payout_old');
    expect(defaultSettlementSort('paid')).toBe('payout_new');
    expect(defaultSettlementSort('all')).toBe('payout_new');
  });

  it('정산 상태 4개 모두 이름이 있고, 정산서에는 아직 묶이지 않은 "지급 예정"이 더 있다', () => {
    for (const status of SETTLEMENT_STATUSES) {
      expect(SETTLEMENT_STATUS_LABELS[status], status).toBeTruthy();
      expect(STATEMENT_STATUS_LABELS[status]).toBe(SETTLEMENT_STATUS_LABELS[status]);
    }
    expect(STATEMENT_STATUS_LABELS.scheduled).toBe('지급 예정');
  });
});

describe('목록 주소', () => {
  it('기본값(지급 전, 그 탭의 기본 정렬, 빈 검색어·기간)은 주소에 넣지 않는다', () => {
    expect(settlementsHref({ filter: 'pending' })).toBe('/admin/settlements');
    expect(settlementsHref({ filter: 'pending', sort: 'payout_old' })).toBe('/admin/settlements');
    expect(settlementsHref({ filter: 'paid', sort: 'payout_new' })).toBe(
      '/admin/settlements?status=paid',
    );
  });

  it('탭을 바꿔도 고른 정렬·검색어·기간을 지킨다', () => {
    expect(
      settlementsHref({
        filter: 'failed',
        sort: 'amount_high',
        query: '샘플 헤어',
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toBe(
      '/admin/settlements?status=failed&sort=amount_high&q=%EC%83%98%ED%94%8C+%ED%97%A4%EC%96%B4&from=2026-11-01&to=2026-11-30',
    );
  });

  it('정산서 한 장: 묶인 정산서는 정산 묶음 id로, 지급 예정 정산서는 샵·지급일로 연다', () => {
    expect(
      statementHref({ shopId: 'shop-1', payoutDate: '2026-11-19', settlementId: 'set-1' }),
    ).toBe('/admin/settlements/set-1');
    expect(statementHref({ shopId: 'shop-1', payoutDate: '2026-11-26' })).toBe(
      '/admin/settlements/shops/shop-1/2026-11-26',
    );
    expect(statementHref({ shopId: 'shop-1', payoutDate: '2026-11-26', settlementId: null })).toBe(
      '/admin/settlements/shops/shop-1/2026-11-26',
    );
  });

  it('지급일 칸은 YYYY-MM-DD만 받고, 모양이 틀리면 null(거르지 않는다)', () => {
    expect(toPayoutDate('2026-11-19')).toBe('2026-11-19');
    expect(toPayoutDate('2026-13-01')).toBeNull();
    expect(toPayoutDate('11/19')).toBeNull();
    expect(toPayoutDate(undefined)).toBeNull();
  });
});
