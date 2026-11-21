// 운영자 샵 상세 '취소 기록'의 기간 고르기(#486, 11/17 nnoinn). 주소 값 읽기, 기간 확인, 주소·이름 만들기. 계산만 한다.
// 주소: /admin/shops/[shopId]?cancelFrom=2026-11-01&cancelTo=2026-11-18. 둘 다 한국 날짜이고 그날을 포함한다(끝일은 하루 전체).
// 둘 다 없으면 전체 기간(지금처럼). 샵 상세에 다른 고르기가 생겨도 겹치지 않게 이름 앞에 cancel을 붙인다.
// 고르는 모양(시작일~끝일, 최근 7·30·90일)은 계정 이력(#436, account-history-query.ts)과 같다

import { firstParam, type SearchValue } from '@/lib/search-params';
import { kstDateKey, kstToUtc } from '@/lib/time';

export type CancelStatsSearch = { cancelFrom?: SearchValue; cancelTo?: SearchValue };

/** 주소에서 읽은 기간(한국 날짜 글자). 없으면 그쪽 끝이 열려 있다 */
export type CancelStatsPeriod = { from?: string; to?: string };

/** 조회에 넘기는 범위: from 이후(포함), before 전. null이면 그쪽 끝이 열려 있다 */
export type CancelStatsRange = { from: Date | null; before: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const text = (value: SearchValue) => firstParam(value)?.trim() || undefined;

/** 주소 값을 기간으로 읽는다. 빈 값은 없는 것으로 본다 */
export function readCancelStatsSearch(params: CancelStatsSearch): CancelStatsPeriod {
  return { from: text(params.cancelFrom), to: text(params.cancelTo) };
}

/** 한국 날짜 'YYYY-MM-DD'의 0시(UTC Date). 모양이 틀리거나 없는 날짜(2026-02-30)면 null */
function kstDayStart(date: string): Date | null {
  if (!DATE_PATTERN.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const start = kstToUtc({ year, month, day, hour: 0, minute: 0 });
  return kstDateKey(start) === date ? start : null;
}

/** 기간을 조회 범위로 바꾼다. 날짜 모양이 틀리거나 시작일이 끝일보다 늦으면 null(화면은 "기간을 다시 골라 주세요") */
export function toCancelStatsRange(period: CancelStatsPeriod): CancelStatsRange | null {
  const from = period.from === undefined ? null : kstDayStart(period.from);
  const toStart = period.to === undefined ? null : kstDayStart(period.to);
  if ((period.from !== undefined && !from) || (period.to !== undefined && !toStart)) return null;
  if (from && toStart && from > toStart) return null;
  // 끝일은 그날 하루를 다 넣는다(다음 날 0시 전까지)
  return { from, before: toStart ? new Date(toStart.getTime() + DAY_MS) : null };
}

/** 기간을 넣은 샵 상세 주소. 빈 끝은 빼고, 둘 다 없으면 샵 상세 주소 그대로(전체 기간) */
export function cancelStatsHref(shopId: string, period: CancelStatsPeriod): string {
  const params = new URLSearchParams();
  if (period.from) params.set('cancelFrom', period.from);
  if (period.to) params.set('cancelTo', period.to);
  const search = params.toString();
  return `/admin/shops/${shopId}${search ? `?${search}` : ''}`;
}

/** 'YYYY-MM-DD' → '11/1'. withYear면 '2026/11/1' */
function shortDate(date: string, withYear = false): string {
  const [year, month, day] = date.split('-').map(Number);
  return withYear ? `${year}/${month}/${day}` : `${month}/${day}`;
}

/** 제목 옆에 보이는 기간 이름: '11/1~11/18', '11/1부터', '11/18까지', '전체 기간'. 해가 다르면 연도도 붙인다 */
export function labelCancelStatsPeriod(period: CancelStatsPeriod): string {
  if (period.from && period.to) {
    const withYear = period.from.slice(0, 4) !== period.to.slice(0, 4);
    return `${shortDate(period.from, withYear)}~${shortDate(period.to, withYear)}`;
  }
  if (period.from) return `${shortDate(period.from)}부터`;
  if (period.to) return `${shortDate(period.to)}까지`;
  return '전체 기간';
}
