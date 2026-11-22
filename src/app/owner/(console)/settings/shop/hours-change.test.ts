import { describe, expect, it } from 'vitest';

import type { BusinessHours } from '@/db/schema/shops';

import {
  type HoursChangeImpact,
  hoursChangeImpact,
  type HoursChangeSlot,
  type HoursChangeWindow,
  isHoursChangeConfirmed,
  sameHours,
} from './hours-change';

// 영업시간을 바꿀 때 영업시간 밖이 되는 매물(11/16 정민석 결정):
// 쉬는 날로 바꾼 요일과 줄인 영업시간 모두, 판매 전 매물·시간대는 마감하고 예약·결제 중인 매물은 그대로 둔다.
// 안/밖은 매물 등록과 같은 계산(checkBusinessHours, 새벽 영업 11/11 nnoinn)

// 2026-11-16(월) 낮 12시. 11/18은 수요일, 11/19는 목요일
const now = new Date('2026-11-16T12:00:00+09:00');
const kst = (value: string) => new Date(`${value.replace(' ', 'T')}:00+09:00`);

/** 매일 10:00 ~ 20:00 */
const EVERY_DAY: BusinessHours = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  open: '10:00',
  close: '20:00',
}));
/** 수요일만 쉬는 날로 바꾼 값 */
const WED_CLOSED: BusinessHours = EVERY_DAY.map((day) =>
  day.weekday === 3 ? { weekday: 3, closed: true } : day,
);

const slot = (
  start: string,
  end: string,
  extra: Partial<HoursChangeSlot> = {},
): HoursChangeSlot => ({
  id: `${start}`,
  status: 'published',
  publishAt: kst('2026-11-15 10:00'),
  startAt: kst(start),
  endAt: kst(end),
  menuName: '커트',
  holdCustomerId: null,
  holdExpiresAt: null,
  windowId: null,
  ...extra,
});

const window = (
  start: string,
  end: string,
  menuNames = ['커트', '펌', '염색'],
): HoursChangeWindow => ({
  id: `w ${start}`,
  startAt: kst(start),
  endAt: kst(end),
  menuNames,
});

const ids = (impact: HoursChangeImpact) => ({
  close: impact.close.map((row) => row.id),
  kept: impact.kept.map((row) => `${row.id} ${row.reason}`),
});

describe('hoursChangeImpact', () => {
  it('쉬는 날로 바꾼 요일: 판매 전 매물·시간대는 마감, 예약·결제 중인 매물은 그대로', () => {
    const impact = hoursChangeImpact({
      slots: [
        slot('2026-11-18 11:00', '2026-11-18 12:00'),
        // 게시 시각 전(게시예정)도 판매 전이다
        slot('2026-11-18 12:00', '2026-11-18 13:00', {
          status: 'scheduled',
          publishAt: kst('2026-11-16 12:00'),
        }),
        slot('2026-11-18 15:00', '2026-11-18 16:00', { status: 'reserved' }),
        slot('2026-11-18 17:00', '2026-11-18 18:00', {
          holdCustomerId: 'c1',
          holdExpiresAt: kst('2026-11-16 12:05'),
        }),
        // 시간대 안에서 손님이 만든 칸: 결제 중이면 그대로, 아니면 시간대를 마감할 때 정리된다
        slot('2026-11-18 13:00', '2026-11-18 14:00', {
          windowId: 'w 2026-11-18 13:00',
          holdCustomerId: 'c2',
          holdExpiresAt: kst('2026-11-16 12:05'),
        }),
        slot('2026-11-18 14:00', '2026-11-18 15:00', { windowId: 'w 2026-11-18 13:00' }),
        // 다른 요일은 그대로
        slot('2026-11-19 11:00', '2026-11-19 12:00'),
      ],
      windows: [
        window('2026-11-18 13:00', '2026-11-18 16:00'),
        window('2026-11-19 13:00', '2026-11-19 16:00'),
      ],
      before: EVERY_DAY,
      after: WED_CLOSED,
      now,
    });
    expect(ids(impact)).toEqual({
      close: ['2026-11-18 11:00', '2026-11-18 12:00', 'w 2026-11-18 13:00'],
      kept: ['2026-11-18 13:00 paying', '2026-11-18 15:00 reserved', '2026-11-18 17:00 paying'],
    });
    expect(impact.close[2]).toMatchObject({ kind: 'window', label: '시간대 매물 · 커트 외 2개' });
    expect(impact.close[0]).toMatchObject({ kind: 'slot', label: '커트' });
  });

  it('쉬는 날이어도 전날 영업이 새벽까지 이어지는 시간은 그대로 영업시간 안이다(화 18:00 ~ 02:00의 수 01:00)', () => {
    const lateTuesday = EVERY_DAY.map((day) =>
      day.weekday === 2 ? { weekday: 2, open: '18:00', close: '02:00' } : day,
    );
    const impact = hoursChangeImpact({
      slots: [
        slot('2026-11-18 01:00', '2026-11-18 02:00'),
        slot('2026-11-18 10:00', '2026-11-18 11:00'),
      ],
      windows: [],
      before: lateTuesday,
      after: lateTuesday.map((day) => (day.weekday === 3 ? { weekday: 3, closed: true } : day)),
      now,
    });
    expect(ids(impact).close).toEqual(['2026-11-18 10:00']);
  });

  it('줄인 영업시간 밖이 되는 매물도 마감한다(목 10:00 ~ 20:00 → 10:00 ~ 18:00)', () => {
    const impact = hoursChangeImpact({
      slots: [
        slot('2026-11-19 17:00', '2026-11-19 18:00'),
        // 끝이 18:00을 넘는다
        slot('2026-11-19 17:30', '2026-11-19 18:30'),
        slot('2026-11-19 19:00', '2026-11-19 20:00'),
      ],
      windows: [window('2026-11-19 16:00', '2026-11-19 19:00')],
      before: EVERY_DAY,
      after: EVERY_DAY.map((day) => (day.weekday === 4 ? { ...day, close: '18:00' } : day)),
      now,
    });
    expect(ids(impact).close).toEqual([
      'w 2026-11-19 16:00',
      '2026-11-19 17:30',
      '2026-11-19 19:00',
    ]);
  });

  it('처음 입력하는 요일은 그 밖의 매물을 묻고, 원래 밖이던 매물은 묻지 않는다', () => {
    // 수요일을 입력하지 않았다가(막지 않음) 10:00 ~ 20:00으로 입력
    const noWednesday = EVERY_DAY.filter((day) => day.weekday !== 3);
    expect(
      ids(
        hoursChangeImpact({
          slots: [slot('2026-11-18 08:00', '2026-11-18 09:00')],
          windows: [],
          before: noWednesday,
          after: EVERY_DAY,
          now,
        }),
      ).close,
    ).toEqual(['2026-11-18 08:00']);
    // 원래 쉬는 날이던 수요일 매물(예전에 올린 것)은 이번 변경과 상관없다
    expect(
      ids(
        hoursChangeImpact({
          slots: [slot('2026-11-18 11:00', '2026-11-18 12:00')],
          windows: [],
          before: WED_CLOSED,
          after: WED_CLOSED.map((day) => (day.weekday === 4 ? { ...day, close: '18:00' } : day)),
          now,
        }),
      ).close,
    ).toEqual([]);
  });

  it('영업시간이 그대로면(요일 순서만 달라도) 아무것도 묻지 않고, 끝난 매물은 보지 않는다', () => {
    const wednesday = [slot('2026-11-18 11:00', '2026-11-18 12:00')];
    expect(
      hoursChangeImpact({
        slots: wednesday,
        windows: [],
        before: EVERY_DAY,
        after: [...EVERY_DAY].reverse(),
        now,
      }),
    ).toEqual({ close: [], kept: [] });
    expect(
      hoursChangeImpact({
        slots: wednesday,
        windows: [],
        before: EVERY_DAY,
        after: WED_CLOSED,
        now: kst('2026-11-18 12:00'),
      }),
    ).toEqual({ close: [], kept: [] });
  });

  it('끝 시각이 바로 지금인 예약 매물과 시간대는 끝난 것으로 보고, 1분 전에는 묻는다', () => {
    const input = {
      slots: [slot('2026-11-18 11:00', '2026-11-18 12:00', { status: 'reserved' })],
      windows: [window('2026-11-18 10:00', '2026-11-18 12:00')],
      before: EVERY_DAY,
      after: WED_CLOSED,
    };
    expect(hoursChangeImpact({ ...input, now: kst('2026-11-18 12:00') })).toEqual({
      close: [],
      kept: [],
    });
    expect(ids(hoursChangeImpact({ ...input, now: kst('2026-11-18 11:59') }))).toEqual({
      close: ['w 2026-11-18 10:00'],
      kept: ['2026-11-18 11:00 reserved'],
    });
  });

  it('시간대 매물 이름: 서비스가 하나면 그 이름, 여럿이면 "외 N개", 없으면 "시간대 매물"', () => {
    const impact = hoursChangeImpact({
      slots: [],
      windows: [
        window('2026-11-18 10:00', '2026-11-18 11:00', ['커트']),
        window('2026-11-18 12:00', '2026-11-18 13:00', ['커트', '펌', '염색']),
        window('2026-11-18 14:00', '2026-11-18 15:00', []),
      ],
      before: EVERY_DAY,
      after: WED_CLOSED,
      now,
    });
    expect(impact.close.map((row) => row.label)).toEqual([
      '시간대 매물 · 커트',
      '시간대 매물 · 커트 외 2개',
      '시간대 매물',
    ]);
  });
});

describe('sameHours', () => {
  it('요일 순서는 보지 않고 값만 비교한다', () => {
    expect(sameHours(EVERY_DAY, [...EVERY_DAY].reverse())).toBe(true);
    expect(sameHours(EVERY_DAY, WED_CLOSED)).toBe(false);
  });
});

describe('isHoursChangeConfirmed', () => {
  const impact: HoursChangeImpact = {
    close: [
      { kind: 'slot', id: 's1', startAt: '', endAt: '', label: '커트' },
      { kind: 'window', id: 'w1', startAt: '', endAt: '', label: '시간대 매물' },
    ],
    kept: [],
  };
  const keptOnly: HoursChangeImpact = {
    close: [],
    kept: [{ kind: 'slot', id: 's2', startAt: '', endAt: '', label: '커트', reason: 'reserved' }],
  };

  it('물을 것이 없으면 확인 없이 저장한다', () => {
    expect(isHoursChangeConfirmed({ close: [], kept: [] }, undefined)).toBe(true);
  });

  it('확인 창을 거치지 않았거나, 창에 없던 매물이 생겼으면 다시 묻는다', () => {
    expect(isHoursChangeConfirmed(impact, undefined)).toBe(false);
    expect(isHoursChangeConfirmed(impact, ['s1'])).toBe(false);
    expect(isHoursChangeConfirmed(impact, ['w1', 's1'])).toBe(true);
    // 창에 있었는데 그사이 없어진 매물은 상관없다
    expect(isHoursChangeConfirmed(impact, ['s1', 'w1', 'gone'])).toBe(true);
  });

  it('그대로 두는 예약만 있어도 확인 창([네])을 거쳐야 저장한다', () => {
    expect(isHoursChangeConfirmed(keptOnly, undefined)).toBe(false);
    expect(isHoursChangeConfirmed(keptOnly, [])).toBe(true);
  });
});
