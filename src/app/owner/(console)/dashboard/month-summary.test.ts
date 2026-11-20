// 대시보드 "이번 달 투리" 카드(S-504)의 달 경계와 문구. 기준은 11/20 정민석 결정:
// 살린 시간은 방문 완료 시술 시간 합, 추가 수입은 수수료를 뗀 정산액 합(패널티 떼기 전, 수수료율 전에는 [미정])

import { describe, expect, it } from 'vitest';

import { UNKNOWN_FEE_NOTE, UNKNOWN_LABEL } from '../settlements/settlement-format';
import {
  kstMonthBounds,
  monthPayoutCaption,
  monthPayoutText,
  monthSummaryNotes,
  savedTimeText,
} from './month-summary';

describe('kstMonthBounds', () => {
  it('한국 시간 1일 0시부터 다음 달 1일 0시 전까지', () => {
    expect(kstMonthBounds('2026-11')).toEqual({
      from: new Date('2026-11-01T00:00:00+09:00'),
      to: new Date('2026-12-01T00:00:00+09:00'),
    });
  });

  it('12월은 다음 해 1월 1일 0시까지', () => {
    expect(kstMonthBounds('2026-12').to).toEqual(new Date('2027-01-01T00:00:00+09:00'));
  });
});

describe('살린 시간 문구', () => {
  it('시간과 분으로, 없으면 "0분"', () => {
    expect(savedTimeText(330)).toBe('5시간 30분');
    expect(savedTimeText(120)).toBe('2시간');
    expect(savedTimeText(30)).toBe('30분');
    expect(savedTimeText(0)).toBe('0분');
  });
});

describe('추가 수입 문구', () => {
  it('수수료를 뗀 정산액 합을 그대로, 수수료율이 정해지기 전이면 [미정], 못 읽으면 "-"', () => {
    expect(monthPayoutText({ count: 3, payoutAmount: 137_900, outstandingPenalty: 0 })).toBe(
      '137,900원',
    );
    expect(monthPayoutText({ count: 3, payoutAmount: null, outstandingPenalty: 0 })).toBe(
      UNKNOWN_LABEL,
    );
    expect(monthPayoutText({ count: 0, payoutAmount: 0, outstandingPenalty: 0 })).toBe('0원');
    expect(monthPayoutText(null)).toBe('-');
  });

  it('아래 작은 글씨는 거래 수, 못 읽으면 그 안내', () => {
    expect(monthPayoutCaption({ count: 3, payoutAmount: null, outstandingPenalty: 0 })).toBe(
      '수수료를 뗀 정산액 · 거래 3건',
    );
    expect(monthPayoutCaption(null)).toBe('정산 내역을 불러오지 못했어요');
  });
});

describe('카드 아래 안내', () => {
  it('[미정]이면 결제 수수료율이 아직 없다는 안내', () => {
    expect(monthSummaryNotes({ count: 2, payoutAmount: null, outstandingPenalty: 0 })).toEqual([
      UNKNOWN_FEE_NOTE,
    ]);
  });

  it('남은 패널티가 있으면 그 금액을 떼기 전이라는 안내(패널티는 빼지 않는다)', () => {
    expect(
      monthSummaryNotes({ count: 2, payoutAmount: 40_000, outstandingPenalty: 5_000 }),
    ).toEqual(['남은 패널티(5,000원)를 떼기 전 금액이에요.']);
    expect(monthSummaryNotes({ count: 2, payoutAmount: null, outstandingPenalty: 5_000 })).toEqual([
      UNKNOWN_FEE_NOTE,
      '남은 패널티(5,000원)를 떼기 전 금액이에요.',
    ]);
  });

  it('금액을 알고 남은 패널티가 없거나, 못 읽었으면 안내가 없다', () => {
    expect(monthSummaryNotes({ count: 2, payoutAmount: 40_000, outstandingPenalty: 0 })).toEqual(
      [],
    );
    expect(monthSummaryNotes(null)).toEqual([]);
  });
});
