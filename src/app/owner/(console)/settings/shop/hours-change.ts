// 영업시간을 바꿀 때 영업시간 밖이 되는 매물 (11/16 정민석). 서버 함수(actions.ts)와 확인 창(hours-change-dialog.tsx)이 같이 쓴다.
// - 바꾸기 전 영업시간 안이었는데 바꾼 뒤 영업시간 밖이 되는 매물만 본다. 쉬는 날로 바꾼 요일과 줄인 영업시간 모두다.
//   안/밖은 매물 등록과 같은 계산(slots/slot-time.ts checkBusinessHours)이라, 쉬는 날에도 전날 영업이 새벽까지 이어지는
//   시간(토 18:00 ~ 02:00의 일요일 01:00)은 그대로 영업시간 안이다. 원래 밖이던 매물(예전에 입력하지 않은 요일 등)은 묻지 않는다
// - 마감하는 것: 원장님이 올린 판매 전(게시예정·게시중) 매물 중 손님이 결제 중이 아닌 것(canEditSlot), 판매 중인 시간대 매물.
//   마감 사유는 '기타'(11/16 정민석, DB 사유 목록은 그대로)
// - 그대로 두는 것: 예약된 매물, 손님이 결제 중인 매물(시간대 안 칸 포함). 마감할 수 없어서 확인 창에 알리기만 한다
// - 원장님이 확인 창에서 본 매물만 마감한다. 저장하는 순간 다시 계산해서 확인하지 않은 매물이 생겼으면 다시 묻는다(isHoursChangeConfirmed)

import type { BusinessHours } from '@/db/schema/shops';
import {
  canEditSlot,
  getSlotStatus,
  isSlotOnHold,
  type SlotHoldInput,
  type SlotStatusInput,
} from '@/features/slot-status/slot-status';

import { checkBusinessHours, type TimeRange } from '../../slots/slot-time';

/** 영업시간을 바꿀 때 살펴볼 매물(앞으로 끝나는 그 샵 매물) */
export type HoursChangeSlot = SlotStatusInput &
  SlotHoldInput & {
    id: string;
    endAt: Date;
    menuName: string;
    /** 시간대 매물 안에서 손님이 만든 칸이면 그 시간대 id. 원장님이 직접 마감하지 않는다 */
    windowId: string | null;
  };

/** 영업시간을 바꿀 때 살펴볼 판매 중(게시예정·게시중) 시간대 매물 */
export type HoursChangeWindow = { id: string; startAt: Date; endAt: Date; menuNames: string[] };

/** 확인 창의 한 줄(화면으로 넘기는 값이라 시각은 ISO 문자열) */
export type HoursChangeItem = {
  kind: 'slot' | 'window';
  id: string;
  startAt: string;
  endAt: string;
  /** 메뉴 이름. 시간대 매물은 "커트 외 2개" */
  label: string;
};

/** 마감하지 않고 그대로 두는 줄과 그 까닭 */
export type HoursChangeKept = HoursChangeItem & { reason: 'reserved' | 'paying' };

export type HoursChangeImpact = { close: HoursChangeItem[]; kept: HoursChangeKept[] };

export const KEPT_REASON_LABELS: Record<HoursChangeKept['reason'], string> = {
  reserved: '예약 있음',
  paying: '손님이 결제 중',
};

/** 요일 순서와 상관없이 같은 영업시간인지 */
export function sameHours(a: BusinessHours, b: BusinessHours): boolean {
  const key = (hours: BusinessHours) =>
    JSON.stringify([...hours].sort((x, y) => x.weekday - y.weekday));
  return key(a) === key(b);
}

/** 바꾸기 전에는 영업시간 안이었는데 바꾼 뒤에는 밖이면 true */
export function leavesBusinessHours(
  range: TimeRange,
  before: BusinessHours,
  after: BusinessHours,
): boolean {
  return checkBusinessHours(range, before) === null && checkBusinessHours(range, after) !== null;
}

/** 시간대 매물 이름. 예: "시간대 매물 · 커트 외 2개" */
function windowLabel(menuNames: readonly string[]): string {
  if (menuNames.length === 0) return '시간대 매물';
  const rest = menuNames.length > 1 ? ` 외 ${menuNames.length - 1}개` : '';
  return `시간대 매물 · ${menuNames[0]}${rest}`;
}

/** 확인 창에 보여줄 매물: 마감할 것과 그대로 둘 것. 영업시간이 그대로면 둘 다 비어 있다 */
export function hoursChangeImpact(input: {
  slots: readonly HoursChangeSlot[];
  windows: readonly HoursChangeWindow[];
  before: BusinessHours;
  after: BusinessHours;
  now: Date;
}): HoursChangeImpact {
  const { before, after, now } = input;
  const impact: HoursChangeImpact = { close: [], kept: [] };
  if (sameHours(before, after)) return impact;
  const item = (
    kind: HoursChangeItem['kind'],
    value: { id: string; startAt: Date; endAt: Date },
    label: string,
  ) => ({
    kind,
    id: value.id,
    startAt: value.startAt.toISOString(),
    endAt: value.endAt.toISOString(),
    label,
  });

  for (const slot of input.slots) {
    if (slot.endAt <= now) continue;
    if (!leavesBusinessHours({ start: slot.startAt, end: slot.endAt }, before, after)) continue;
    const row = item('slot', slot, slot.menuName);
    if (getSlotStatus(slot, now) === 'reserved') impact.kept.push({ ...row, reason: 'reserved' });
    else if (isSlotOnHold(slot, now)) impact.kept.push({ ...row, reason: 'paying' });
    // 시간대 안 칸은 시간대를 마감할 때 같이 정리된다(결제 없이 끝난 칸은 닫힘)
    else if (slot.windowId === null && canEditSlot(slot, now)) impact.close.push(row);
  }
  for (const window of input.windows) {
    if (window.endAt <= now) continue;
    if (!leavesBusinessHours({ start: window.startAt, end: window.endAt }, before, after)) continue;
    impact.close.push(item('window', window, windowLabel(window.menuNames)));
  }
  const byStart = (a: HoursChangeItem, b: HoursChangeItem) => a.startAt.localeCompare(b.startAt);
  impact.close.sort(byStart);
  impact.kept.sort(byStart);
  return impact;
}

/** 확인 창을 띄워야 하면 true(마감할 매물이나 그대로 두는 예약이 있다) */
export function needsHoursChangeConfirm(impact: HoursChangeImpact): boolean {
  return impact.close.length > 0 || impact.kept.length > 0;
}

/**
 * 원장님이 확인 창에서 [네]를 눌렀고, 마감할 매물이 모두 그 창에 있었으면 true.
 * confirmed는 확인 창에서 본 마감할 매물 id 목록이다(확인 창을 거치지 않았으면 undefined)
 */
export function isHoursChangeConfirmed(
  impact: HoursChangeImpact,
  confirmed: readonly string[] | undefined,
): boolean {
  if (!needsHoursChangeConfirm(impact)) return true;
  if (!confirmed) return false;
  const seen = new Set(confirmed);
  return impact.close.every((row) => seen.has(row.id));
}
