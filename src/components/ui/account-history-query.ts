// 계정 이력(#374) 화면 주소 값 읽기와 주소 만들기. 계산만 한다(화면과 테스트가 같이 쓴다).
// 원장님 계정 이력(/owner/account/history, 11/18 정민석)이 쓰고, 운영자 [이력 보기](src/app/admin/users/history-query.ts)와 같은 규칙이다.
// 주소 예: /owner/account/history?from=2026-11-01&to=2026-11-14&kind=cancel&page=2
// from·to는 한국 날짜(둘 다 그날 포함), kind는 종류 묶음, page는 1부터. 모두 없어도 된다.

import { firstParam, type SearchValue } from '@/lib/search-params';
import { kstDateKey, kstToUtc } from '@/lib/time';
import {
  ACCOUNT_HISTORY_CATEGORIES,
  type AccountHistoryQuery,
  type AccountType,
} from '@/server/accounts/history-types';

export type AccountHistorySearch = {
  page?: SearchValue;
  from?: SearchValue;
  to?: SearchValue;
  kind?: SearchValue;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 빠른 기간 버튼(최근 N일, 오늘 포함) */
export const QUICK_PERIOD_DAYS = [7, 30, 90] as const;

const text = (value: SearchValue) => firstParam(value)?.trim() || undefined;

/** 주소 값을 이력 고르기로 바꾼다. 빈 값은 없는 것으로, 그 계정 종류에 없는 종류는 전체로 본다 */
export function readAccountHistorySearch(
  params: AccountHistorySearch,
  accountType: AccountType,
): AccountHistoryQuery {
  const page = Number(text(params.page));
  const kind = text(params.kind);
  return {
    page: Number.isInteger(page) && page > 0 ? page : undefined,
    from: text(params.from),
    to: text(params.to),
    category: ACCOUNT_HISTORY_CATEGORIES[accountType].find((category) => category === kind),
  };
}

/** 이력 화면 주소. 1쪽과 빈 값은 빼고 쓴다 */
export function accountHistoryHref(path: string, query: AccountHistoryQuery): string {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.category) params.set('kind', query.category);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** 오늘(한국 날짜 'YYYY-MM-DD')까지 최근 days일 */
export function recentPeriod(today: string, days: number): { from: string; to: string } {
  const [year, month, day] = today.split('-').map(Number);
  const start = kstToUtc({ year, month, day, hour: 0, minute: 0 });
  return { from: kstDateKey(new Date(start.getTime() - (days - 1) * DAY_MS)), to: today };
}
