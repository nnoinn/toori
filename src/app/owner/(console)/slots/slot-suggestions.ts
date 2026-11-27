// 매물 등록 맨 위 "이번 주 권하는 매물"(S-411 주간 매물 등록 권유)의 계산과 글자. 화면('use client')에서 쓴다.
// 권유 계산은 src/features/weekly-suggest(서버가 화면을 열 때 한 번 한다). 여기는 그 결과를 버튼으로 바꾼다:
// 지금 고를 수 없는 권유(메뉴가 빠졌거나 시작 시각이 지났거나 범위 밖)는 빼고, 시작 시각을 ISO로 계산해 둔다.

import type { SuggestedSlot } from '@/features/weekly-suggest/weekly-suggest';
import { formatKst, kstToUtc } from '@/lib/time';
import type { DiscountRate } from '@/server/policy';

import { partsOfKey } from './calendar-days';
import { checkStart } from './slot-time';

/** 권유 버튼 하나. startIso는 권유 날짜·시각(한국 시간)의 시작 시각이고, 권유끼리 겹치지 않아 버튼마다 다르다 */
export type SuggestionChip = SuggestedSlot & { startIso: string };

/** 권유의 시작 시각. 날짜 'YYYY-MM-DD'와 시각 'HH:MM'은 한국 시간이다 */
export function suggestedStartAt({
  date,
  startTime,
}: Pick<SuggestedSlot, 'date' | 'startTime'>): Date {
  const [hour, minute] = startTime.split(':').map(Number);
  return kstToUtc({ ...partsOfKey(date), hour, minute });
}

/**
 * 받은 권유(날짜·시각 순서)를 버튼으로. 지금 고를 수 있는 메뉴가 아니거나(그사이 숨김) 지금 고를 수 없는
 * 시작 시각(지난 시각·14일 밖)이면 뺀다. 화면을 연 서버 시각(now)으로 한 번만 정한다
 */
export function toSuggestionChips(
  items: readonly SuggestedSlot[],
  menuIds: readonly string[],
  now: Date,
): SuggestionChip[] {
  const selectable = new Set(menuIds);
  return items.flatMap((item) => {
    const start = suggestedStartAt(item);
    if (!selectable.has(item.menuId) || checkStart(start, now) !== null) return [];
    return [{ ...item, startIso: start.toISOString() }];
  });
}

/** 버튼 글자. 예: "12/1(화) 14:00 · 여성 커트 · 30%", "12/5(토) 11:00 · 전체 염색 · 20% · 신규 고객 전용" */
export function suggestionLabel(chip: SuggestionChip, menuName: string): string {
  const parts = [formatKst(new Date(chip.startIso)), menuName, `${chip.discountRate}%`];
  if (chip.newCustomerOnly) parts.push('신규 고객 전용');
  return parts.join(' · ');
}

/** 지금 고른 값 */
export type ChosenSlotValues = {
  menuId: string | null;
  startIso: string | null;
  discountRate: DiscountRate | null;
  newCustomerOnly: boolean;
};

/** 지금 고른 값이 이 권유와 같은지(눌린 버튼으로 보여 준다) */
export function isSameSuggestion(chip: SuggestionChip, chosen: ChosenSlotValues): boolean {
  return (
    chip.menuId === chosen.menuId &&
    chip.startIso === chosen.startIso &&
    chip.discountRate === chosen.discountRate &&
    chip.newCustomerOnly === chosen.newCustomerOnly
  );
}

/**
 * 방금 올린 매물이 어느 권유를 올린 것인지. 메뉴와 시작 시각이 같으면 그 권유를 올린 것으로 본다
 * (할인율·신규 고객 전용을 바꿔 올려도 그 시간은 찼다). 없으면 null
 */
export function postedSuggestion(
  chips: readonly SuggestionChip[],
  saved: { menuId: string; startIso: string },
): SuggestionChip | null {
  return (
    chips.find((chip) => chip.menuId === saved.menuId && chip.startIso === saved.startIso) ?? null
  );
}
