// 매물 등록 "지난 매물로 빠르게 올리기"(S-207 매물 복제, 11/20 정민석)의 고르기와 글자.
// 지금 고를 수 있는 메뉴·할인율인 구성만 받은 순서(최근 것부터)대로 6개까지, 누르면 그 값이 눌린 버튼으로 보인다

import { describe, expect, it } from 'vitest';

import {
  isSameSlotPreset,
  pickSlotPresets,
  SLOT_PRESET_LIMIT,
  slotPresetLabel,
} from './slot-presets';

const row = (menuId: string, discountRate: number, newCustomerOnly = false) => ({
  menuId,
  discountRate,
  newCustomerOnly,
});

describe('pickSlotPresets', () => {
  it('지금 고를 수 있는 메뉴만, 받은 순서 그대로', () => {
    expect(
      pickSlotPresets(
        [row('perm', 10), row('hidden', 50), row('cut', 50), row('cut', 30, true)],
        ['cut', 'perm'],
      ),
    ).toEqual([
      { menuId: 'perm', discountRate: 10, newCustomerOnly: false },
      { menuId: 'cut', discountRate: 50, newCustomerOnly: false },
      { menuId: 'cut', discountRate: 30, newCustomerOnly: true },
    ]);
  });

  it('지금 고를 수 없는 할인율(10/20/30/40/50% 밖)은 뺀다', () => {
    expect(pickSlotPresets([row('cut', 15), row('cut', 0), row('cut', 40)], ['cut'])).toEqual([
      { menuId: 'cut', discountRate: 40, newCustomerOnly: false },
    ]);
  });

  it(`${SLOT_PRESET_LIMIT}개까지만(뺀 것은 세지 않는다)`, () => {
    const rows = [
      row('hidden', 10),
      ...[10, 20, 30, 40, 50].map((rate) => row('cut', rate)),
      ...[10, 20].map((rate) => row('cut', rate, true)),
    ];
    const presets = pickSlotPresets(rows, ['cut']);
    expect(SLOT_PRESET_LIMIT).toBe(6);
    expect(presets).toHaveLength(6);
    expect(presets[0]).toEqual({ menuId: 'cut', discountRate: 10, newCustomerOnly: false });
    expect(presets[5]).toEqual({ menuId: 'cut', discountRate: 10, newCustomerOnly: true });
  });

  it('지난 매물이 없으면 빈 목록', () => {
    expect(pickSlotPresets([], ['cut'])).toEqual([]);
  });
});

describe('버튼', () => {
  it('글자는 "서비스 · 할인율", 신규 고객 전용이면 뒤에 붙인다', () => {
    expect(
      slotPresetLabel({ menuId: 'cut', discountRate: 50, newCustomerOnly: false }, '여성 커트'),
    ).toBe('여성 커트 · 50%');
    expect(
      slotPresetLabel({ menuId: 'color', discountRate: 30, newCustomerOnly: true }, '전체 염색'),
    ).toBe('전체 염색 · 30% · 신규 고객 전용');
  });

  it('지금 고른 서비스·할인율·신규 고객 전용이 모두 같을 때만 눌린 버튼', () => {
    const preset = { menuId: 'cut', discountRate: 50, newCustomerOnly: false } as const;
    expect(
      isSameSlotPreset(preset, { menuId: 'cut', discountRate: 50, newCustomerOnly: false }),
    ).toBe(true);
    expect(
      isSameSlotPreset(preset, { menuId: 'cut', discountRate: 50, newCustomerOnly: true }),
    ).toBe(false);
    expect(
      isSameSlotPreset(preset, { menuId: 'cut', discountRate: 30, newCustomerOnly: false }),
    ).toBe(false);
    expect(
      isSameSlotPreset(preset, { menuId: 'perm', discountRate: 50, newCustomerOnly: false }),
    ).toBe(false);
    expect(
      isSameSlotPreset(preset, { menuId: null, discountRate: null, newCustomerOnly: false }),
    ).toBe(false);
  });
});
