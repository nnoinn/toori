import { describe, expect, it } from 'vitest';

import { planWindowRates, windowRatesSchema } from './window-rates';

// 시간대 매물 할인율 수정(11/16 정민석): 서비스마다 할인율만 바꾸고, 할인가는 정가 × (1 − 할인율)을 그대로(원 미만 버림, S-203)

const CUT = '00000000-0000-4000-8000-000000000001';
const PERM = '00000000-0000-4000-8000-000000000002';
const WINDOW = '00000000-0000-4000-8000-0000000000aa';

const current = [
  { menuId: CUT, listPrice: 33500, discountRate: 10 },
  { menuId: PERM, listPrice: 98000, discountRate: 20 },
];

describe('planWindowRates', () => {
  it('바뀐 서비스만 돌려주고 할인가는 등록과 같은 계산(33,500원 30% → 23,450원)', () => {
    expect(
      planWindowRates(current, [
        { menuId: CUT, discountRate: 30 },
        { menuId: PERM, discountRate: 20 },
      ]),
    ).toEqual({ ok: true, updates: [{ menuId: CUT, discountRate: 30, salePrice: 23450 }] });
  });

  it('하나도 바꾸지 않았으면 빈 목록', () => {
    expect(
      planWindowRates(current, [
        { menuId: PERM, discountRate: 20 },
        { menuId: CUT, discountRate: 10 },
      ]),
    ).toEqual({ ok: true, updates: [] });
  });

  it('시간대의 서비스와 다르면(빠짐·더함·겹침) 받지 않는다', () => {
    const other = '00000000-0000-4000-8000-000000000003';
    const changed = { ok: false, problem: 'MENUS_CHANGED' };
    expect(planWindowRates(current, [{ menuId: CUT, discountRate: 30 }])).toEqual(changed);
    expect(
      planWindowRates(current, [
        { menuId: CUT, discountRate: 30 },
        { menuId: PERM, discountRate: 30 },
        { menuId: other, discountRate: 30 },
      ]),
    ).toEqual(changed);
    expect(
      planWindowRates(current, [
        { menuId: CUT, discountRate: 30 },
        { menuId: CUT, discountRate: 40 },
      ]),
    ).toEqual(changed);
  });

  it('서비스 종류 수가 같아도 같은 서비스를 두 번 보내거나 다른 서비스로 바꿔 보내면 받지 않는다', () => {
    const other = '00000000-0000-4000-8000-000000000003';
    const changed = { ok: false, problem: 'MENUS_CHANGED' };
    // 서비스는 커트·펌 둘 다 있지만 커트를 두 번 보냈다
    expect(
      planWindowRates(current, [
        { menuId: CUT, discountRate: 30 },
        { menuId: PERM, discountRate: 30 },
        { menuId: CUT, discountRate: 40 },
      ]),
    ).toEqual(changed);
    // 두 개를 보냈지만 펌 대신 시간대에 없는 서비스다
    expect(
      planWindowRates(current, [
        { menuId: CUT, discountRate: 30 },
        { menuId: other, discountRate: 30 },
      ]),
    ).toEqual(changed);
  });
});

describe('windowRatesSchema', () => {
  const input = (discountRate: number) => ({
    windowId: WINDOW,
    rates: [{ menuId: CUT, discountRate }],
  });

  it('할인율은 등록과 같은 선택지(10/20/30/40/50%)만 받는다', () => {
    for (const rate of [10, 20, 30, 40, 50]) {
      expect(windowRatesSchema.safeParse(input(rate)).success).toBe(true);
    }
    for (const rate of [0, 5, 15, 60]) {
      expect(windowRatesSchema.safeParse(input(rate)).success).toBe(false);
    }
  });

  it('시간대·서비스 id 모양이 아니거나 서비스가 없으면 받지 않는다', () => {
    expect(windowRatesSchema.safeParse({ ...input(30), windowId: 'abc' }).success).toBe(false);
    expect(windowRatesSchema.safeParse({ windowId: WINDOW, rates: [] }).success).toBe(false);
  });
});
