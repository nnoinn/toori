import { describe, expect, it } from 'vitest';

import type { BusinessHours } from '@/db/schema/shops';
import { WEEKLY_SUGGEST_MAX_ITEMS } from '@/server/policy';

import {
  lookbackRange,
  pickWeeklySuggestion,
  type SoldSlot,
  weeklySuggestHref,
  type WeeklySuggestInput,
  weekStartOf,
} from './weekly-suggest';

// 2026-11-30(월) ~ 12-06(일) 주를 기준으로 본다. 지난 4주는 11-02(월) ~ 11-29(일)
const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+09:00`);
const MONDAY_10AM = at('2026-11-30', '10:00');

const sold = (
  date: string,
  hm: string,
  extra: Partial<Omit<SoldSlot, 'startAt'>> = {},
): SoldSlot => ({
  startAt: at(date, hm),
  menuId: 'cut',
  discountRate: 30,
  newCustomerOnly: false,
  ...extra,
});

/** 매일 10:00 ~ 20:00 */
const DAILY_10_TO_20: BusinessHours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  open: '10:00',
  close: '20:00',
}));

const input = (extra: Partial<WeeklySuggestInput>): WeeklySuggestInput => ({
  now: MONDAY_10AM,
  sold: [],
  menus: [
    { id: 'cut', durationMinutes: 60 },
    { id: 'perm', durationMinutes: 120 },
  ],
  businessHours: DAILY_10_TO_20,
  busy: [],
  ...extra,
});

const itemsOf = (extra: Partial<WeeklySuggestInput>) => {
  const result = pickWeeklySuggestion(input(extra));
  return result.status === 'suggested' ? result.items : result.status;
};

describe('주간 매물 등록 권유: 이번 주와 지난 4주 (S-411)', () => {
  it('이번 주는 월요일부터 일요일까지(한국 날짜)', () => {
    expect(weekStartOf(MONDAY_10AM)).toBe('2026-11-30');
    expect(weekStartOf(at('2026-12-06', '23:59'))).toBe('2026-11-30');
    expect(weekStartOf(at('2026-12-07', '00:00'))).toBe('2026-12-07');
    // UTC로는 아직 일요일이어도 한국 시간 월요일이면 새 주
    expect(weekStartOf(new Date('2026-12-06T15:30:00Z'))).toBe('2026-12-07');
  });

  it('판매는 이번 주 월요일 0시 전 4주만 본다(주 중간에 불러도 같다)', () => {
    const range = lookbackRange(at('2026-12-03', '15:00'));
    expect(range.start).toEqual(at('2026-11-02', '00:00'));
    expect(range.end).toEqual(at('2026-11-30', '00:00'));
  });
});

describe('주간 매물 등록 권유: 고르기 (S-411)', () => {
  it('요일·시작 시각·메뉴·할인율이 같은 판매를 묶어 많이 팔린 것부터 최대 3개, 날짜·시각 순서로 권한다', () => {
    const items = itemsOf({
      sold: [
        // 토 11:00 펌 20% 3번
        sold('2026-11-14', '11:00', { menuId: 'perm', discountRate: 20 }),
        sold('2026-11-21', '11:00', { menuId: 'perm', discountRate: 20 }),
        sold('2026-11-28', '11:00', { menuId: 'perm', discountRate: 20 }),
        // 화 14:00 커트 30% 2번
        sold('2026-11-17', '14:00'),
        sold('2026-11-24', '14:00'),
        // 목 16:00 커트 30% 2번
        sold('2026-11-12', '16:00'),
        sold('2026-11-26', '16:00'),
        // 수 12:00 커트 50% 1번 → 4번째라 빠진다
        sold('2026-11-25', '12:00', { discountRate: 50 }),
      ],
    });
    expect(WEEKLY_SUGGEST_MAX_ITEMS).toBe(3);
    expect(items).toEqual([
      {
        date: '2026-12-01',
        startTime: '14:00',
        menuId: 'cut',
        discountRate: 30,
        newCustomerOnly: false,
      },
      {
        date: '2026-12-03',
        startTime: '16:00',
        menuId: 'cut',
        discountRate: 30,
        newCustomerOnly: false,
      },
      {
        date: '2026-12-05',
        startTime: '11:00',
        menuId: 'perm',
        discountRate: 20,
        newCustomerOnly: false,
      },
    ]);
  });

  it('팔린 수가 같으면 최근에 팔린 묶음부터', () => {
    const items = itemsOf({
      sold: [
        sold('2026-11-03', '11:00'), // 화, 가장 오래됨 → 빠진다
        sold('2026-11-11', '11:00'), // 수
        sold('2026-11-19', '11:00'), // 목
        sold('2026-11-27', '11:00'), // 금
      ],
    });
    expect(items).not.toBe('nothing_to_suggest');
    expect(Array.isArray(items) && items.map((item) => item.date)).toEqual([
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
    ]);
  });

  it('같은 날에 여러 개도 권하지만, 시간이 겹치면 덜 팔린 것을 뺀다', () => {
    const items = itemsOf({
      sold: [
        sold('2026-11-21', '11:00'),
        sold('2026-11-28', '11:00'),
        sold('2026-11-28', '15:00'),
        // 토 11:30 펌은 11:00 커트와 겹친다
        sold('2026-11-28', '11:30', { menuId: 'perm' }),
      ],
    });
    expect(Array.isArray(items) && items.map((item) => `${item.date} ${item.startTime}`)).toEqual([
      '2026-12-05 11:00',
      '2026-12-05 15:00',
    ]);
  });

  it('신규 고객 전용은 따로 묶고 그대로 권한다', () => {
    const items = itemsOf({ sold: [sold('2026-11-24', '14:00', { newCustomerOnly: true })] });
    expect(items).toEqual([
      {
        date: '2026-12-01',
        startTime: '14:00',
        menuId: 'cut',
        discountRate: 30,
        newCustomerOnly: true,
      },
    ]);
  });
});

describe('주간 매물 등록 권유: 빼는 것 (S-411)', () => {
  it('이미 지난 날짜와 지난 시각은 뺀다', () => {
    const items = itemsOf({
      now: at('2026-12-02', '13:00'),
      sold: [
        sold('2026-11-24', '14:00'), // 화: 지난 날짜
        sold('2026-11-25', '12:00'), // 수 12:00: 지난 시각
        sold('2026-11-25', '15:00'), // 수 15:00: 된다
      ],
    });
    expect(Array.isArray(items) && items.map((item) => `${item.date} ${item.startTime}`)).toEqual([
      '2026-12-02 15:00',
    ]);
  });

  it('쉬는 날과 영업시간 밖(지금 메뉴 소요 시간으로)은 뺀다', () => {
    const hours: BusinessHours = DAILY_10_TO_20.map((item) =>
      item.weekday === 2 ? { weekday: 2, closed: true } : item,
    );
    const items = itemsOf({
      businessHours: hours,
      // 커트가 지금은 90분이라 18:30 시작은 20:00을 넘는다
      menus: [{ id: 'cut', durationMinutes: 90 }],
      sold: [
        sold('2026-11-24', '14:00'), // 화: 쉬는 날
        sold('2026-11-26', '18:30'), // 목 18:30 ~ 20:00(지금 90분) → 영업시간 안
        sold('2026-11-27', '19:00'), // 금 19:00 ~ 20:30 → 영업시간 밖
      ],
    });
    expect(Array.isArray(items) && items.map((item) => `${item.date} ${item.startTime}`)).toEqual([
      '2026-12-03 18:30',
    ]);
  });

  it('영업시간을 입력하지 않은 요일은 막지 않는다(매물 등록과 같다)', () => {
    const items = itemsOf({ businessHours: [], sold: [sold('2026-11-24', '07:00')] });
    expect(Array.isArray(items) && items.map((item) => `${item.date} ${item.startTime}`)).toEqual([
      '2026-12-01 07:00',
    ]);
  });

  it('그날 매물이나 시간대 매물이 하나라도 있으면 그 날짜는 뺀다(시간이 달라도)', () => {
    const items = itemsOf({
      sold: [sold('2026-11-24', '14:00'), sold('2026-11-26', '16:00')],
      // 화요일 아침 매물(이미 끝났어도 오늘 0시부터 읽는다)
      busy: [{ start: at('2026-12-01', '10:00'), end: at('2026-12-01', '11:00') }],
    });
    expect(Array.isArray(items) && items.map((item) => item.date)).toEqual(['2026-12-03']);
  });

  it('전날 밤에 시작한 매물과 겹치는 시간도 뺀다', () => {
    const allDay: BusinessHours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      open: '00:00',
      close: '00:00',
    }));
    const items = itemsOf({
      businessHours: allDay,
      sold: [sold('2026-11-25', '01:00'), sold('2026-11-27', '01:00')],
      // 화 23:00 ~ 수 02:00 시간대 매물(날짜는 화요일)
      busy: [{ start: at('2026-12-01', '23:00'), end: at('2026-12-02', '02:00') }],
    });
    expect(Array.isArray(items) && items.map((item) => `${item.date} ${item.startTime}`)).toEqual([
      '2026-12-04 01:00',
    ]);
  });

  it('지금 고를 수 없는 메뉴(숨김·업종 변경)와 할인율은 빼고 센다', () => {
    const items = itemsOf({
      sold: [
        sold('2026-11-24', '14:00', { menuId: 'hidden' }),
        sold('2026-11-17', '14:00', { menuId: 'hidden' }),
        sold('2026-11-26', '16:00', { discountRate: 25 }),
        sold('2026-11-27', '16:00'),
      ],
    });
    expect(Array.isArray(items) && items.map((item) => item.date)).toEqual(['2026-12-04']);
  });
});

describe('주간 매물 등록 권유: 결과 종류 (S-411, #626)', () => {
  it('지금 올릴 수 있는 메뉴의 판매가 없으면 no_history', () => {
    expect(pickWeeklySuggestion(input({ sold: [] }))).toEqual({ status: 'no_history' });
    expect(
      pickWeeklySuggestion(input({ sold: [sold('2026-11-24', '14:00', { menuId: 'hidden' })] })),
    ).toEqual({ status: 'no_history' });
  });

  it('판매는 있지만 모두 빠지면 nothing_to_suggest', () => {
    expect(
      pickWeeklySuggestion(
        input({
          sold: [sold('2026-11-24', '14:00')],
          busy: [{ start: at('2026-12-01', '18:00'), end: at('2026-12-01', '19:00') }],
        }),
      ),
    ).toEqual({ status: 'nothing_to_suggest' });
  });

  it('권하면 이번 주 월요일을 같이 준다', () => {
    const result = pickWeeklySuggestion(
      input({ now: at('2026-12-03', '09:00'), sold: [sold('2026-11-28', '11:00')] }),
    );
    expect(result).toMatchObject({ status: 'suggested', weekStart: '2026-11-30' });
  });

  it('알림을 누르면 열 주소: 권유가 있으면 권유를 채운 등록 화면, 기록이 없으면 등록 화면', () => {
    expect(weeklySuggestHref('suggested')).toBe('/owner/slots/new?from=weekly-suggest');
    expect(weeklySuggestHref('no_history')).toBe('/owner/slots/new');
  });
});
