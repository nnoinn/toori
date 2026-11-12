// 시간대 매물 등록 입력 확인 (#308). 묶음 합치기·겹침, 시작·영업시간, 이미 올린 시간, 메뉴·할인율을 본다.

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';

import { checkWindowDraft, mergeRanges, type ShopMenu } from './rules';

/** 2026-11-13(금) 한국 시간 'HH:MM' */
const at = (hm: string, day = 13) => {
  const [hour, minute] = hm.split(':').map(Number);
  return kstToUtc({ year: 2026, month: 11, day, hour, minute });
};
const range = (start: string, end: string) => ({ start: at(start), end: at(end) });

const NOW = at('09:00', 12);
const MENUS: ShopMenu[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    serviceType: 'cut',
    name: '커트',
    description: null,
    listPrice: 20_000,
    durationMinutes: 60,
    hidden: false,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    serviceType: 'perm',
    name: '펌',
    description: '디지털 펌',
    listPrice: 80_000,
    durationMinutes: 180,
    hidden: false,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    serviceType: 'color',
    name: '숨긴 염색',
    description: null,
    listPrice: 60_000,
    durationMinutes: 120,
    hidden: true,
  },
];
const [CUT, PERM, HIDDEN] = MENUS;

const draft = (extra: Partial<Parameters<typeof checkWindowDraft>[0]> = {}) =>
  checkWindowDraft({
    ranges: [range('10:00', '12:00'), range('13:00', '18:00')],
    menus: [
      { menuId: CUT.id, discountRate: 30 },
      { menuId: PERM.id, discountRate: 20 },
    ],
    shopMenus: MENUS,
    businessHours: [],
    busy: [],
    now: NOW,
    ...extra,
  });

describe('mergeRanges', () => {
  it('맞닿은 묶음은 합치고 시작 순으로, 겹치면 null', () => {
    expect(
      mergeRanges([range('13:00', '15:00'), range('10:00', '12:00'), range('12:00', '13:00')]),
    ).toEqual([range('10:00', '15:00')]);
    expect(mergeRanges([range('10:00', '12:00'), range('11:30', '13:00')])).toBeNull();
  });
});

describe('checkWindowDraft', () => {
  it('묶음마다 시간대 하나, 게시 시각은 시작 48시간 전(지났으면 지금), 할인가는 서버가 계산', () => {
    const result = draft();
    expect(result).toEqual({
      ok: true,
      windows: [
        { ...range('10:00', '12:00'), status: 'published', publishAt: NOW },
        { ...range('13:00', '18:00'), status: 'published', publishAt: NOW },
      ],
      menus: [
        {
          menuId: CUT.id,
          serviceType: 'cut',
          menuName: '커트',
          menuDescription: null,
          listPrice: 20_000,
          durationMinutes: 60,
          discountRate: 30,
          salePrice: 14_000,
        },
        expect.objectContaining({ menuId: PERM.id, discountRate: 20, salePrice: 64_000 }),
      ],
    });
  });

  it('48시간보다 먼 시간대는 예약대기로 두고 48시간 전에 게시한다', () => {
    const result = draft({ ranges: [{ start: at('13:00', 20), end: at('18:00', 20) }] });
    expect(result).toMatchObject({
      ok: true,
      windows: [{ status: 'scheduled', publishAt: at('13:00', 18) }],
    });
  });

  it('입력 문제: 묶음·서비스 없음, 묶음끼리 겹침, 같은 메뉴 두 번, 선택지에 없는 할인율', () => {
    expect(draft({ ranges: [] })).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(draft({ menus: [] })).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(draft({ ranges: [range('10:00', '12:00'), range('11:00', '13:00')] })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(
      draft({
        menus: [
          { menuId: CUT.id, discountRate: 30 },
          { menuId: CUT.id, discountRate: 20 },
        ],
      }),
    ).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(draft({ menus: [{ menuId: CUT.id, discountRate: 25 }] })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
  });

  it('시작·끝은 30분 단위, 시작은 지금 뒤·14일 안', () => {
    expect(draft({ ranges: [range('10:15', '12:00')] })).toEqual({
      ok: false,
      code: 'NOT_ON_STEP',
    });
    expect(draft({ ranges: [range('08:00', '12:00')], now: at('09:00') })).toEqual({
      ok: false,
      code: 'PAST',
    });
    expect(draft({ ranges: [{ start: at('10:00', 30), end: at('12:00', 30) }] })).toEqual({
      ok: false,
      code: 'TOO_FAR',
    });
  });

  it('영업시간 밖이거나 쉬는 날이면 막는다(영업시간을 입력하지 않은 요일은 막지 않는다)', () => {
    const hours = [{ weekday: 5, open: '11:00', close: '20:00' }];
    expect(draft({ businessHours: hours })).toEqual({ ok: false, code: 'OUTSIDE_HOURS' });
    expect(draft({ businessHours: [{ weekday: 5, closed: true }] })).toEqual({
      ok: false,
      code: 'CLOSED_DAY',
    });
    expect(draft({ businessHours: [{ weekday: 1, open: '11:00', close: '20:00' }] }).ok).toBe(true);
  });

  it('이미 올린 매물·시간대와 겹치면 WINDOW_OVERLAP', () => {
    expect(draft({ busy: [range('17:00', '18:30')] })).toEqual({
      ok: false,
      code: 'WINDOW_OVERLAP',
    });
    expect(draft({ busy: [range('12:00', '13:00')] }).ok).toBe(true);
  });

  it('숨긴 메뉴·남의 메뉴는 MENU_NOT_FOUND, 가장 긴 묶음보다 긴 메뉴는 MENU_TOO_LONG', () => {
    expect(draft({ menus: [{ menuId: HIDDEN.id, discountRate: 30 }] })).toEqual({
      ok: false,
      code: 'MENU_NOT_FOUND',
    });
    expect(
      draft({ menus: [{ menuId: '44444444-4444-4444-8444-444444444444', discountRate: 30 }] }),
    ).toEqual({ ok: false, code: 'MENU_NOT_FOUND' });
    expect(
      draft({
        ranges: [range('10:00', '12:00'), range('13:00', '15:00')],
        menus: [{ menuId: PERM.id, discountRate: 30 }],
      }),
    ).toEqual({ ok: false, code: 'MENU_TOO_LONG' });
  });
});
