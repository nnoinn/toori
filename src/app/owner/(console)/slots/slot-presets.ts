// 매물 등록 "지난 매물로 빠르게 올리기"(S-207 매물 복제, 11/20 정민석). 화면('use client')과 서버가 같이 쓴다.
// 최근에 올린 한 시술 매물을 서비스(메뉴)·할인율·신규 고객 전용이 같은 것끼리 묶어 최근 것부터 보여 주고,
// 누르면 ①③ 값을 채워 ② 시간부터 연다. 날짜·시각은 원장님이 다시 고르고, 가격은 지금 메뉴 값으로 계산한다.
// 지금 고를 수 없는 메뉴(숨김·업종 변경)와 지금 고를 수 없는 할인율은 뺀다

import { DISCOUNT_RATE_OPTIONS, type DiscountRate } from '@/server/policy';

/** 묶은 지난 매물 한 줄(조회 결과). 최근에 올린 묶음부터 온다 */
export type SlotPresetRow = { menuId: string; discountRate: number; newCustomerOnly: boolean };

/** 화면에 보여 줄 지난 매물 구성 */
export type SlotPreset = { menuId: string; discountRate: DiscountRate; newCustomerOnly: boolean };

/** 보여 줄 구성 수 */
export const SLOT_PRESET_LIMIT = 6;

const isDiscountRate = (rate: number): rate is DiscountRate =>
  (DISCOUNT_RATE_OPTIONS as readonly number[]).includes(rate);

/** 지금 고를 수 있는 메뉴·할인율인 구성만 받은 순서대로 limit개까지 */
export function pickSlotPresets(
  rows: readonly SlotPresetRow[],
  menuIds: readonly string[],
  limit = SLOT_PRESET_LIMIT,
): SlotPreset[] {
  const selectable = new Set(menuIds);
  const presets: SlotPreset[] = [];
  for (const row of rows) {
    if (presets.length >= limit) break;
    const { discountRate } = row;
    if (!selectable.has(row.menuId) || !isDiscountRate(discountRate)) continue;
    presets.push({ menuId: row.menuId, discountRate, newCustomerOnly: row.newCustomerOnly });
  }
  return presets;
}

/** 버튼 글자. 예: "여성 커트 · 50%", "전체 염색 · 30% · 신규 고객 전용" */
export function slotPresetLabel(preset: SlotPreset, menuName: string): string {
  const parts = [menuName, `${preset.discountRate}%`];
  if (preset.newCustomerOnly) parts.push('신규 고객 전용');
  return parts.join(' · ');
}

/** 지금 고른 값이 이 구성과 같은지(눌린 버튼으로 보여 준다) */
export function isSameSlotPreset(
  preset: SlotPreset,
  chosen: { menuId: string | null; discountRate: DiscountRate | null; newCustomerOnly: boolean },
): boolean {
  return (
    preset.menuId === chosen.menuId &&
    preset.discountRate === chosen.discountRate &&
    preset.newCustomerOnly === chosen.newCustomerOnly
  );
}
