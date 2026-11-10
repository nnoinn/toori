// 공휴일 목록과 영업일 시간 계산. 기댓값은 기술 가이드 7장 "이의제기"·"정산 주기"와 #299 2장 예시다.

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';

import {
  addBusinessHours,
  isBusinessDay,
  PUBLIC_HOLIDAYS,
  PUBLIC_HOLIDAYS_LAST_YEAR,
} from './holidays';

/** 한국 시간 'YYYY-MM-DD HH:MM' → UTC Date */
function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

describe('PUBLIC_HOLIDAYS', () => {
  it('날짜 모양이 맞고, 날짜 순이고, 겹치지 않는다', () => {
    for (const date of PUBLIC_HOLIDAYS) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...PUBLIC_HOLIDAYS].sort()).toEqual([...PUBLIC_HOLIDAYS]);
    expect(new Set(PUBLIC_HOLIDAYS).size).toBe(PUBLIC_HOLIDAYS.length);
  });

  it('목록이 있는 해는 2026년부터 마지막 해까지이고, 해마다 신정·설날·추석·성탄절이 있다', () => {
    const years = new Set(PUBLIC_HOLIDAYS.map((date) => Number(date.slice(0, 4))));
    expect(Math.max(...years)).toBe(PUBLIC_HOLIDAYS_LAST_YEAR);
    for (const year of years) {
      const ofYear = PUBLIC_HOLIDAYS.filter((date) => date.startsWith(`${year}-`));
      expect(ofYear).toContain(`${year}-01-01`);
      expect(ofYear).toContain(`${year}-12-25`);
      // 설날·추석은 사흘씩
      expect(ofYear.length).toBeGreaterThanOrEqual(15);
    }
  });

  it('2026년부터 공휴일이 된 노동절·제헌절이 들어 있다', () => {
    expect(PUBLIC_HOLIDAYS).toEqual(
      expect.arrayContaining(['2026-05-01', '2026-07-17', '2027-05-01', '2027-07-17']),
    );
  });
});

describe('isBusinessDay', () => {
  it('평일은 영업일, 토·일·공휴일은 아니다(한국 날짜 기준)', () => {
    expect(isBusinessDay(kst('2026-11-11 12:00'))).toBe(true); // 수
    expect(isBusinessDay(kst('2026-11-14 12:00'))).toBe(false); // 토
    expect(isBusinessDay(kst('2026-11-15 12:00'))).toBe(false); // 일
    expect(isBusinessDay(kst('2026-12-25 12:00'))).toBe(false); // 금, 기독탄신일
    expect(isBusinessDay(kst('2027-02-09 12:00'))).toBe(false); // 화, 대체공휴일(설날)
  });

  it('UTC로는 전날이어도 한국 날짜로 본다', () => {
    // 한국 12/25(금) 08:00 = UTC 12/24 23:00
    expect(isBusinessDay(new Date('2026-12-24T23:00:00Z'))).toBe(false);
    // 한국 12/24(목) 08:00
    expect(isBusinessDay(new Date('2026-12-23T23:00:00Z'))).toBe(true);
  });
});

describe('addBusinessHours (이의제기 접수 기한, 48시간)', () => {
  it('#299 예시: 일요일 15:00 → 수요일 00:00(일요일은 세지 않고 월·화 48시간)', () => {
    expect(addBusinessHours(kst('2026-11-15 15:00'), 48)).toEqual(kst('2026-11-18 00:00'));
  });

  it('#299 예시: 금요일 15:00 → 다음 주 화요일 15:00', () => {
    expect(addBusinessHours(kst('2026-11-13 15:00'), 48)).toEqual(kst('2026-11-17 15:00'));
  });

  it('#299 예시: 수요일 18:00 → 금요일 18:00', () => {
    expect(addBusinessHours(kst('2026-11-11 18:00'), 48)).toEqual(kst('2026-11-13 18:00'));
  });

  it('공휴일 하루가 끼면 그만큼 늦어진다: 12/24(목) 18:00 → 12/25(금) 공휴일·주말을 건너 12/29(화) 18:00', () => {
    expect(addBusinessHours(kst('2026-12-24 18:00'), 48)).toEqual(kst('2026-12-29 18:00'));
  });

  it('연휴가 길어도 센다: 2027 추석 앞 9/13(월) 15:00 → 9/20(월) 15:00', () => {
    expect(addBusinessHours(kst('2027-09-13 15:00'), 48)).toEqual(kst('2027-09-20 15:00'));
  });

  it('기준 시각이 쉬는 날이면 다음 영업일 0시부터 센다', () => {
    expect(addBusinessHours(kst('2026-12-25 10:00'), 48)).toEqual(kst('2026-12-30 00:00'));
  });

  it('0시간이면 그대로, 음수는 받지 않는다', () => {
    expect(addBusinessHours(kst('2026-11-11 18:00'), 0)).toEqual(kst('2026-11-11 18:00'));
    expect(() => addBusinessHours(kst('2026-11-11 18:00'), -1)).toThrow(RangeError);
  });
});
