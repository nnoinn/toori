// 원장님 월별 통계(S-504)의 달 고르기·날 칸 값·문구. 기준은 11/20 정민석 결정:
// 살린 시간은 방문 완료 시술 시간 합, 추가 수입은 수수료를 뗀 정산액 합(패널티 떼기 전, 수수료율 전에는 [미정]),
// 거래는 처리·취소일(한국 날짜)에 놓고 날 칸을 누르면 그날 거래 내역

import { describe, expect, it } from 'vitest';

import { UNKNOWN_FEE_NOTE, UNKNOWN_LABEL } from '../settlements/settlement-format';
import {
  buildStatsDays,
  dayItemsHref,
  hasNextStatsMonth,
  kstMonthBounds,
  resolveStatsMonth,
  savedTimeText,
  statsHref,
  statsPayoutCaption,
  statsPayoutText,
  statsSummaryNotes,
  sumVisits,
} from './stats';

const NOW = new Date('2026-11-20T10:00:00+09:00');

describe('보는 달', () => {
  it('주소의 달이 맞는 모양이고 이번 달 이후가 아니면 그 달, 아니면 이번 달', () => {
    expect(resolveStatsMonth('2026-10', NOW)).toBe('2026-10');
    expect(resolveStatsMonth('2026-11', NOW)).toBe('2026-11');
    expect(resolveStatsMonth('2026-12', NOW)).toBe('2026-11');
    expect(resolveStatsMonth('2026-13', NOW)).toBe('2026-11');
    expect(resolveStatsMonth('2026-1', NOW)).toBe('2026-11');
    expect(resolveStatsMonth(undefined, NOW)).toBe('2026-11');
  });

  it('주소는 이번 달이면 month 없이, 다음 달 버튼은 이번 달까지만', () => {
    expect(statsHref('2026-11', NOW)).toBe('/owner/stats');
    expect(statsHref('2026-10', NOW)).toBe('/owner/stats?month=2026-10');
    expect(hasNextStatsMonth('2026-10', NOW)).toBe(true);
    expect(hasNextStatsMonth('2026-11', NOW)).toBe(false);
  });

  it('한국 시간 1일 0시부터 다음 달 1일 0시 전까지, 12월은 다음 해 1월까지', () => {
    expect(kstMonthBounds('2026-11')).toEqual({
      from: new Date('2026-11-01T00:00:00+09:00'),
      to: new Date('2026-12-01T00:00:00+09:00'),
    });
    expect(kstMonthBounds('2026-12').to).toEqual(new Date('2027-01-01T00:00:00+09:00'));
  });
});

describe('날 칸 값', () => {
  it('거래는 처리·취소 시각의 한국 날짜에 종류별로 세고, 칩은 이용 완료·노쇼·고객 취소 순', () => {
    const days = buildStatsDays(
      [
        { kind: 'penalty', occurredAt: '2026-11-01T03:00:00.000Z' },
        { kind: 'sale', occurredAt: '2026-11-01T05:00:00.000Z' },
        { kind: 'sale', occurredAt: '2026-11-01T06:00:00.000Z' },
        { kind: 'no_show', occurredAt: '2026-11-01T07:00:00.000Z' },
        // 한국 시간 11/2 0시 30분(UTC로는 11/1)
        { kind: 'owner_cancel', occurredAt: '2026-11-01T15:30:00.000Z' },
      ],
      [{ dateKey: '2026-11-01', visitCount: 2, minutes: 150 }],
    );
    expect(days.get('2026-11-01')).toEqual({
      kinds: [
        { kind: 'sale', count: 2 },
        { kind: 'no_show', count: 1 },
        { kind: 'penalty', count: 1 },
      ],
      minutes: 150,
    });
    expect(days.get('2026-11-02')).toEqual({
      kinds: [{ kind: 'owner_cancel', count: 1 }],
      minutes: 0,
    });
    expect(days.size).toBe(2);
  });

  it('거래를 못 읽어도 방문한 날은 살린 시간만으로 칸이 생긴다', () => {
    expect(buildStatsDays([], [{ dateKey: '2026-11-03', visitCount: 1, minutes: 60 }])).toEqual(
      new Map([['2026-11-03', { kinds: [], minutes: 60 }]]),
    );
  });

  it('달 합계는 날마다 더한 값', () => {
    expect(
      sumVisits([
        { dateKey: '2026-11-01', visitCount: 2, minutes: 150 },
        { dateKey: '2026-11-03', visitCount: 1, minutes: 60 },
      ]),
    ).toEqual({ visitCount: 3, minutes: 210 });
    expect(sumVisits([])).toEqual({ visitCount: 0, minutes: 0 });
  });

  it('날 칸을 누르면 그날 하루 거래 내역', () => {
    expect(dayItemsHref('2026-11-03')).toBe(
      '/owner/settlements?view=items&from=2026-11-03&to=2026-11-03',
    );
  });
});

describe('문구', () => {
  it('살린 시간은 시간과 분으로, 없으면 "0분"', () => {
    expect(savedTimeText(330)).toBe('5시간 30분');
    expect(savedTimeText(120)).toBe('2시간');
    expect(savedTimeText(30)).toBe('30분');
    expect(savedTimeText(0)).toBe('0분');
  });

  it('추가 수입은 정산액 합 그대로, 수수료율이 정해지기 전이면 [미정], 못 읽으면 "-"', () => {
    expect(statsPayoutText({ count: 3, payoutAmount: 137_900, outstandingPenalty: 0 })).toBe(
      '137,900원',
    );
    expect(statsPayoutText({ count: 3, payoutAmount: null, outstandingPenalty: 0 })).toBe(
      UNKNOWN_LABEL,
    );
    expect(statsPayoutText({ count: 0, payoutAmount: 0, outstandingPenalty: 0 })).toBe('0원');
    expect(statsPayoutText(null)).toBe('-');
    expect(statsPayoutCaption({ count: 3, payoutAmount: null, outstandingPenalty: 0 })).toBe(
      '수수료를 뗀 정산액 · 거래 3건',
    );
    expect(statsPayoutCaption(null)).toBe('정산 내역을 불러오지 못했어요');
  });

  it('안내: [미정]이면 수수료율 안내, 남은 패널티가 있으면 떼기 전이라는 안내(패널티는 빼지 않는다)', () => {
    expect(statsSummaryNotes({ count: 2, payoutAmount: null, outstandingPenalty: 0 })).toEqual([
      UNKNOWN_FEE_NOTE,
    ]);
    expect(
      statsSummaryNotes({ count: 2, payoutAmount: 40_000, outstandingPenalty: 5_000 }),
    ).toEqual(['남은 패널티(5,000원)를 떼기 전 금액이에요.']);
    expect(statsSummaryNotes({ count: 2, payoutAmount: 40_000, outstandingPenalty: 0 })).toEqual(
      [],
    );
    expect(statsSummaryNotes(null)).toEqual([]);
  });
});
