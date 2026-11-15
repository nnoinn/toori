// 계정 이력(#374) 한 쪽 만들기. 기록마다 따로 읽은 일들을 합쳐 최신 순으로 줄 세우고, 쪽 번호에 맞는 줄을 자른다. 계산만 한다(DB 없음).
// 기록마다 (쪽 × 줄 수)개까지 읽어 오면 합친 앞쪽 줄이 모두 들어 있다. 쪽 수는 기록마다 센 전체 수를 더해 정한다.
// 같은 시각이면 원래 기록 id 순, 그다음 일 이름 순으로 줄 세운다. DB에서도 기록마다 1/1000초 단위 시각과 id 순으로 읽어서
// 쪽을 넘겨도 줄이 겹치거나 빠지지 않는다(시드처럼 매물 46개를 한 번에 만들어 시각이 같아도).

import type { AccountHistoryEvent, AccountHistoryPage } from './history-types';
import { HISTORY_MAX_PAGE } from './history-types';

/** 기록 하나를 읽은 결과: 이번에 읽은 일(최신 순)과 조건에 맞는 전체 수 */
export type HistoryList = { events: AccountHistoryEvent[]; total: number };

/** 받은 쪽 번호를 1~최대 쪽으로 맞춘다. 없거나 숫자가 아니면 1쪽 */
export function clampHistoryPage(page: number | undefined): number {
  if (page === undefined || !Number.isFinite(page)) return 1;
  return Math.min(HISTORY_MAX_PAGE, Math.max(1, Math.floor(page)));
}

/** 원래 기록 id(key는 '일:id') */
function sourceId(event: AccountHistoryEvent): string {
  return event.key.slice(event.key.indexOf(':') + 1);
}

/** 최신 순, 같은 시각이면 원래 기록 id 순, 그다음 일 이름 순(기록마다 DB에서 읽는 순서와 같다) */
export function compareHistoryEvents(a: AccountHistoryEvent, b: AccountHistoryEvent): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  const idA = sourceId(a);
  const idB = sourceId(b);
  if (idA !== idB) return idA < idB ? -1 : 1;
  if (a.kind === b.kind) return 0;
  return a.kind < b.kind ? -1 : 1;
}

/** 기록마다 읽은 일을 합쳐 page쪽(1부터)을 자른다. 쪽 수보다 큰 쪽을 달라고 하면 마지막 쪽을 준다 */
export function toHistoryPage(
  lists: readonly HistoryList[],
  page: number,
  size: number,
): AccountHistoryPage {
  const total = lists.reduce((sum, list) => sum + list.total, 0);
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pageCount);
  const events = lists
    .flatMap((list) => list.events)
    .sort(compareHistoryEvents)
    .slice((current - 1) * size, current * size);
  return { events, page: current, pageCount, total };
}
