// 최근 본 매물(C-212) 규칙. 화면(recent-button.tsx·recent-recorder.tsx)과 테스트가 쓴다. 브라우저 저장소 값은 받아서 판단만 한다.
// 🟡 이 기기(localStorage)에만 남기고(로그인 없이도 된다) 최근 20개까지 보여 준다. 서버에는 남기지 않는다.
// 🟡 시작이 지난 매물은 빼고, 마감된 매물은 흐리게 보여 준다(빼고 흐리게 하는 판단은 서버 조회 actions.ts가 한다).
// 한 시술 매물과 시간대 매물(#308)을 같이 남긴다. 시간대는 마감되면 상세가 열리지 않아서 목록에서도 뺀다.

import { formatWon } from '@/lib/format';
import { formatKst } from '@/lib/time';
import { isUuid } from '@/lib/uuid';
import { windowMenuText } from '@/features/map/slot-list/window-card';
import { windowRangeText } from '@/features/map/slot-list/window-range';

import type { RecentItem } from './types';

/** 남겨 두는 곳(localStorage) */
export const RECENT_SLOTS_KEY = 'toori:recent-slots';

/** 남겨 두는 수(새것부터) */
export const RECENT_SLOT_LIMIT = 20;

/** 기록이 바뀌었다고 같은 화면의 버튼에 알리는 이벤트 이름 */
export const RECENT_SLOTS_EVENT = 'toori:recent-slots-changed';

export type RecentEntry = { kind: 'slot' | 'window'; id: string };

const sameEntry = (a: RecentEntry, b: RecentEntry) => a.kind === b.kind && a.id === b.id;

/** 저장해 둔 값을 읽는다. 모양이 틀린 줄은 버리고, 겹치지 않게 상한까지 */
export function parseRecentEntries(raw: string | null): RecentEntry[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const entries: RecentEntry[] = [];
    for (const item of value) {
      if (typeof item !== 'object' || item === null) continue;
      const { kind, id } = item as Record<string, unknown>;
      if ((kind !== 'slot' && kind !== 'window') || !isUuid(id)) continue;
      const entry: RecentEntry = { kind, id };
      if (!entries.some((seen) => sameEntry(seen, entry))) entries.push(entry);
    }
    return entries.slice(0, RECENT_SLOT_LIMIT);
  } catch {
    return [];
  }
}

/** 본 매물을 맨 앞에 더한다. 이미 있으면 맨 앞으로 옮기고, 상한을 넘으면 오래된 것부터 뺀다 */
export function addRecentEntry(list: readonly RecentEntry[], entry: RecentEntry): RecentEntry[] {
  return [entry, ...list.filter((item) => !sameEntry(item, entry))].slice(0, RECENT_SLOT_LIMIT);
}

/** 서버에 물어볼 매물 id(종류별) */
export function recentIds(list: readonly RecentEntry[]) {
  return {
    slotIds: list.filter((entry) => entry.kind === 'slot').map((entry) => entry.id),
    windowIds: list.filter((entry) => entry.kind === 'window').map((entry) => entry.id),
  };
}

/** 서버가 준 매물을 본 순서(새것부터)로 놓는다. 서버가 빼고 준 매물(시작 지남·볼 수 없음)은 빠진다 */
export function inViewedOrder(
  list: readonly RecentEntry[],
  items: readonly RecentItem[],
): RecentItem[] {
  return list.flatMap((entry) =>
    items.filter((item) => item.kind === entry.kind && item.id === entry.id),
  );
}

/**
 * 최근 본 매물 버튼을 둘 화면인지. 매물·시간대 상세는 이미 매물을 보고 있고 폰에서 아래 예약 바와 겹쳐서,
 * 지도는 아래 목록 시트와 겹쳐서 두지 않는다
 */
export function showsRecentButton(pathname: string): boolean {
  if (pathname.startsWith('/slots/') || pathname.startsWith('/windows/')) return false;
  if (pathname === '/home/map' || pathname.startsWith('/home/map/')) return false;
  return true;
}

/** 목록 한 줄에 보여 줄 글자 */
export function recentItemTexts(item: RecentItem) {
  if (item.kind === 'window') {
    return {
      title: windowMenuText(item.menuName, item.menuCount),
      time: windowRangeText(item.startAt, item.endAt ?? item.startAt),
      price: `최대 ${item.discountRate}% · ${formatWon(item.salePrice)}부터`,
    };
  }
  return {
    title: item.menuName,
    time: formatKst(new Date(item.startAt)),
    price: `${item.discountRate}% ${formatWon(item.salePrice)}`,
  };
}

/** 매물 상세 주소 */
export function recentItemHref(item: Pick<RecentItem, 'kind' | 'id'>): string {
  return item.kind === 'slot' ? `/slots/${item.id}` : `/windows/${item.id}`;
}
