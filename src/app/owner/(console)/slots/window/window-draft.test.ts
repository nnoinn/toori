import { describe, expect, it } from 'vitest';

import type { SlotMenuOption } from '../slot-form';
import {
  applyRateToAll,
  commonRate,
  fittingMenuIds,
  menuFit,
  prefillFromLast,
  windowDraftInput,
} from './window-draft';

// 고른 날 11/14(한국 시간)
const at = (time: string) => new Date(`2026-11-14T${time}:00+09:00`);
const range = (start: string, end: string) => ({ start: at(start), end: at(end) });
// #308 예: 10:00~12:00과 13:00~18:00을 켜면 시간대 두 개(2시간, 5시간)
const ranges = [range('10:00', '12:00'), range('13:00', '18:00')];

const menu = (id: string, durationMinutes: number): SlotMenuOption => ({
  id,
  serviceType: 'cut',
  name: id,
  listPrice: 30000,
  durationMinutes,
});
const cut = menu('커트', 60);
const perm = menu('펌', 120);
const color = menu('뿌리염색', 180);
const magic = menu('매직', 300);
const clinic = menu('클리닉', 330);
const menus = [cut, perm, color, magic, clinic];

describe('② 서비스가 고른 시간에 들어가는지 (#308)', () => {
  it('소요 시간이 가장 긴 묶음보다 길면 고를 수 없고, 딱 같으면 고를 수 있다', () => {
    // 가장 긴 묶음 13:00~18:00 = 5시간(300분)
    expect(menuFit(magic.durationMinutes, ranges)).toMatchObject({
      fits: true,
      longestMinutes: 300,
    });
    expect(menuFit(clinic.durationMinutes, ranges)).toMatchObject({
      fits: false,
      longestMinutes: 300,
    });
  });

  it('짧은 묶음에만 안 들어가는 서비스는 고를 수 있고, 안 들어가는 묶음을 알려 준다', () => {
    const fit = menuFit(color.durationMinutes, ranges);
    expect(fit.fits).toBe(true);
    expect(fit.shortRanges).toEqual([range('10:00', '12:00')]);
    // 묶음 길이와 딱 같으면(펌 2시간, 10:00~12:00) 그 묶음에도 들어간다
    expect(menuFit(perm.durationMinutes, ranges).shortRanges).toEqual([]);
  });

  it('고른 시간이 없으면 어떤 서비스도 고를 수 없다', () => {
    expect(menuFit(cut.durationMinutes, [])).toEqual({
      fits: false,
      longestMinutes: 0,
      shortRanges: [],
    });
  });

  it('고른 서비스 중 들어가는 것만 메뉴 순서로 남기고, 시간을 줄이면 안 들어가는 서비스는 빠진다', () => {
    expect(fittingMenuIds(menus, new Set(['클리닉', '펌', '커트']), ranges)).toEqual([
      '커트',
      '펌',
    ]);
    expect(
      fittingMenuIds(menus, new Set(['뿌리염색', '펌', '커트']), [range('10:00', '12:00')]),
    ).toEqual(['커트', '펌']);
  });
});

describe('③ 할인율: 전체에 한 번에, 서비스마다 따로 (#308)', () => {
  it('전체 칩은 고른 서비스 모두에 적용하고, 그 뒤 서비스마다 바꿀 수 있다', () => {
    const all = applyRateToAll({}, ['커트', '펌'], 30);
    expect(all).toEqual({ 커트: 30, 펌: 30 });
    expect(commonRate(all, ['커트', '펌'])).toBe(30);

    const changed = { ...all, 펌: 20 as const };
    expect(changed).toEqual({ 커트: 30, 펌: 20 });
    expect(commonRate(changed, ['커트', '펌'])).toBeNull();
    // 다시 전체 칩을 누르면 서비스별로 바꾼 값도 덮는다
    expect(applyRateToAll(changed, ['커트', '펌'], 50)).toEqual({ 커트: 50, 펌: 50 });
  });

  it('할인율을 고르지 않은 서비스가 있거나 고른 서비스가 없으면 전체 칩은 골라진 모양이 아니다', () => {
    expect(commonRate({ 커트: 30 }, ['커트', '펌'])).toBeNull();
    expect(commonRate({ 펌: 30 }, ['커트', '펌'])).toBeNull();
    expect(commonRate({ 커트: 30 }, [])).toBeNull();
  });
});

describe('지난 설정 채우기 (#308, getLastWindowSettings)', () => {
  it('지금 고를 수 있는 메뉴만 채우고, 선택지 밖 할인율은 비워 둔다', () => {
    const prefill = prefillFromLast(
      {
        menus: [
          { menuId: '커트', discountRate: 30 },
          // 지금 숨겼거나 업종이 바뀌어 고를 수 없는 메뉴
          { menuId: '숨긴메뉴', discountRate: 20 },
          { menuId: '펌', discountRate: 25 },
        ],
        newCustomerOnly: true,
      },
      menus,
    );
    expect([...prefill.chosen]).toEqual(['커트', '펌']);
    expect(prefill.rates).toEqual({ 커트: 30 });
    expect(prefill.newCustomerOnly).toBe(true);
  });

  it('올린 적 없거나 남은 메뉴가 없으면 아무것도 채우지 않는다', () => {
    const empty = { chosen: new Set(), rates: {}, newCustomerOnly: false };
    expect(prefillFromLast(null, menus)).toEqual(empty);
    expect(
      prefillFromLast(
        { menus: [{ menuId: '숨긴메뉴', discountRate: 30 }], newCustomerOnly: true },
        menus,
      ),
    ).toEqual(empty);
  });
});

describe('④ 등록 입력 (createSlotWindows)', () => {
  it('묶음마다 시작·끝, 서비스마다 할인율을 보낸다', () => {
    expect(windowDraftInput(ranges, ['커트', '펌'], { 커트: 30, 펌: 20 }, true)).toEqual({
      ranges: [
        { startAt: '2026-11-14T01:00:00.000Z', endAt: '2026-11-14T03:00:00.000Z' },
        { startAt: '2026-11-14T04:00:00.000Z', endAt: '2026-11-14T09:00:00.000Z' },
      ],
      menus: [
        { menuId: '커트', discountRate: 30 },
        { menuId: '펌', discountRate: 20 },
      ],
      newCustomerOnly: true,
    });
  });

  it('고른 시간·서비스가 없거나 할인율을 고르지 않은 서비스가 있으면 만들지 않는다', () => {
    expect(windowDraftInput([], ['커트'], { 커트: 30 }, false)).toBeNull();
    expect(windowDraftInput(ranges, [], {}, false)).toBeNull();
    expect(windowDraftInput(ranges, ['커트', '펌'], { 커트: 30 }, false)).toBeNull();
  });
});
