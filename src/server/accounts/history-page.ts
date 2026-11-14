// 계정 이력(#374) 한 쪽 만들기. 기록마다 따로 읽은 일들을 합쳐 최신 순으로 limit개를 자른다. DB는 받은 읽기 함수로만 부른다.
// 다음 쪽은 nextBefore(이번 쪽 마지막 일의 시각)보다 앞선 일이다. 그래서 자르는 시각의 일은 이번 쪽에 모두 넣는다.
// 기록 하나가 limit + 1개를 다 채워 왔는데 그 끝이 자르는 시각이면 그 시각의 일이 DB에 더 있을 수 있다(한 번에 만든 매물은
// 등록 시각이 같다). 그때는 그 시각만 다시 읽어 채운다. 다시 읽지 않으면 다음 쪽이 "그 시각보다 앞선 것"이라 영영 빠진다.
// 시각은 1/1000초까지만 오가므로(DB는 더 잘게 저장한다) "그 시각"은 그 1/1000초 안이다.

import type { AccountHistoryEvent, AccountHistoryPage } from './history-types';
import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from './history-types';

/** 같은 시각의 일을 다시 읽을 때 기록마다 읽는 최대 줄 수(한 1/1000초에 이보다 많이 만드는 일은 없다고 본다) */
export const HISTORY_TIE_LIMIT = 1000;

/** 기록마다 읽는 범위: before보다 앞서고 from(있으면, 포함) 이후인 일을 최신 순으로 limit + 1개까지 */
export type HistoryRange = { before: Date | null; from: Date | null; limit: number };

/** 범위를 받아 기록마다 읽은 일 목록을 주는 함수(history-store의 원장님·고객 읽기) */
export type HistoryReader = (range: HistoryRange) => Promise<AccountHistoryEvent[][]>;

/** 받은 줄 수를 1~최대로 맞춘다. 없거나 숫자가 아니면 기본값 */
export function clampHistoryLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return HISTORY_DEFAULT_LIMIT;
  return Math.min(HISTORY_MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

/** 최신 순, 같은 시각이면 key 순 */
function newestFirst(a: AccountHistoryEvent, b: AccountHistoryEvent): number {
  return a.at === b.at ? a.key.localeCompare(b.key) : b.at.localeCompare(a.at);
}

/** 이번 쪽을 자르는 시각(limit번째 일의 시각). limit개 이하면 자르지 않는다(null) */
function cutAt(sorted: readonly AccountHistoryEvent[], limit: number): string | null {
  return sorted.length > limit ? sorted[limit - 1].at : null;
}

/** 한 쪽을 읽는다. 자르는 시각의 일을 다 읽지 못했을 수 있으면 그 시각만 다시 읽어 채운다 */
export async function readHistoryPage(
  read: HistoryReader,
  before: Date | null,
  limit: number,
): Promise<AccountHistoryPage> {
  const lists = await read({ before, from: null, limit });
  const cut = cutAt(lists.flat().sort(newestFirst), limit);
  // limit + 1개를 채워 온 기록의 끝은 자르는 시각이거나 그보다 앞선다. 자르는 시각이면 그 시각의 일이 더 있을 수 있다
  const unfinished =
    cut !== null &&
    lists.some((list) => list.length > limit && list.every((event) => event.at >= cut));
  if (!unfinished) return toHistoryPage(lists, limit);
  const from = new Date(cut);
  const tie = await read({ before: new Date(from.getTime() + 1), from, limit: HISTORY_TIE_LIMIT });
  return toHistoryPage(lists, limit, tie.flat());
}

/**
 * 최신 순(같은 시각이면 key 순)으로 합쳐 limit개로 자른다. 각 목록은 limit + 1개까지 읽어 온 것이다.
 * tie는 자르는 시각만 다시 읽은 일이다. 있으면 그 시각의 일을 이것으로 바꾼다.
 */
export function toHistoryPage(
  lists: readonly (readonly AccountHistoryEvent[])[],
  limit: number,
  tie: readonly AccountHistoryEvent[] = [],
): AccountHistoryPage {
  const all = lists.flat().sort(newestFirst);
  const cut = cutAt(all, limit);
  if (cut === null) return { events: all, nextBefore: null };
  let end = limit;
  while (end < all.length && all[end].at === cut) end += 1;
  const events =
    tie.length > 0
      ? [...all.filter((event) => event.at > cut), ...tie.filter((event) => event.at === cut)].sort(
          newestFirst,
        )
      : all.slice(0, end);
  // 남은 줄이 있거나, 어느 목록이든 limit + 1개를 다 채워 왔으면(DB에 더 있을 수 있다) 다음 쪽이 있다
  const more = end < all.length || lists.some((list) => list.length > limit);
  return { events, nextBefore: more ? cut : null };
}
