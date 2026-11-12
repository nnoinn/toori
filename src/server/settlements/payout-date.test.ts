// 정산 지급일 (X-206, #353). 기댓값은 기술 가이드 7장 "정산 주기"(매주 목요일, 공휴일이면 다음 영업일)와
// 공휴일 목록(src/server/policy/holidays.ts)의 날짜다. 서비스 시각으로 본 예시는 settle-rules.test.ts에 있다.

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';

import { payoutDateFor } from './payout-date';

/** 한국 시간 'YYYY-MM-DD HH:MM' → UTC Date */
function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

describe('payoutDateFor: 지급일', () => {
  it('기한이 그 주 목요일 0시 전에 지났으면 그 목요일에 지급한다', () => {
    expect(payoutDateFor(kst('2026-11-16 09:00'))).toBe('2026-11-19'); // 월요일
    expect(payoutDateFor(kst('2026-11-18 23:59'))).toBe('2026-11-19'); // 수요일 밤
  });

  it('기한이 목요일 0시와 같으면 그날, 0시가 조금이라도 지나면 다음 주 목요일이다', () => {
    const thursday = kst('2026-11-19 00:00');
    expect(payoutDateFor(thursday)).toBe('2026-11-19');
    expect(payoutDateFor(new Date(thursday.getTime() + 1))).toBe('2026-11-26');
    expect(payoutDateFor(kst('2026-11-19 15:00'))).toBe('2026-11-26');
  });

  it('금·토·일에 기한이 지나면 다음 주 목요일이다', () => {
    expect(payoutDateFor(kst('2026-11-20 10:00'))).toBe('2026-11-26');
    expect(payoutDateFor(kst('2026-11-22 23:00'))).toBe('2026-11-26');
  });

  it('목요일이 공휴일이면 다음 영업일(금요일)에 지급하고, 그 0시까지 기한이 지난 거래를 묶는다', () => {
    // 2027-05-13(목) 부처님오신날
    expect(payoutDateFor(kst('2027-05-12 10:00'))).toBe('2027-05-14');
    expect(payoutDateFor(kst('2027-05-13 10:00'))).toBe('2027-05-14');
    expect(payoutDateFor(kst('2027-05-14 00:00'))).toBe('2027-05-14');
    expect(payoutDateFor(kst('2027-05-14 09:00'))).toBe('2027-05-20');
    // 2027-09-16(목) 추석
    expect(payoutDateFor(kst('2027-09-15 12:00'))).toBe('2027-09-17');
  });

  it('목·금이 모두 공휴일이면 주말을 건너 월요일에 지급하고, 다음 주는 다시 목요일이다', () => {
    // 2026-09-24(목)·25(금) 추석, 26(토)·27(일)
    expect(payoutDateFor(kst('2026-09-23 12:00'))).toBe('2026-09-28');
    expect(payoutDateFor(kst('2026-09-27 23:00'))).toBe('2026-09-28');
    expect(payoutDateFor(kst('2026-09-28 10:00'))).toBe('2026-10-01');
  });
});
