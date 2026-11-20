// 원장님 월별 통계(S-504) 계산과 문구. 화면과 서버 어디서나 가져올 수 있다. 정한 것(11/20 정민석):
// - 왼쪽 메뉴 [통계](/owner/stats?month=YYYY-MM). 달력 날 칸마다 그날 거래와 그날 살린 시간.
//   방문 완료한 거래는 "이용 완료" 대신 서비스(메뉴) 이름을 초록 칩으로, 나머지(노쇼·고객 취소 등)는 종류별 건수로
// - 살린 시간: 방문 완료로 처리한 예약의 시술 시간(매물 시작~끝) 합. 노쇼·취소·무효는 빈 시간을 채운 게 아니라서 뺀다
// - 추가 수입: 정산 내역(getSettlementItems)의 그 달 정산액 합. 수수료를 뗀 뒤, 원장님 사정 취소 패널티는 떼기 전이라
//   정산 화면 "이 기간 합계"의 정산액과 같다. 결제 수수료율이 정해지기 전에는 [미정]
// - 거래는 정산 내역과 같이 방문·노쇼 처리일이나 취소일(한국 날짜)에 놓는다. 날 칸을 누르면 그날 거래 내역이 열린다

import { formatDuration, formatWon } from '@/lib/format';
import { kstDateKey, kstToUtc } from '@/lib/time';
import type { SettlementItemView, SettlementItemViewKind } from '@/server/settlements/types';

import {
  currentMonth,
  settlementsHref,
  shiftMonth,
  UNKNOWN_FEE_NOTE,
  wonOrUnknown,
} from '../settlements/settlement-format';

/** 그날 방문 완료 예약 수와 시술 시간 합(분). dateKey는 방문 처리일(한국 날짜) */
export type VisitDay = { dateKey: string; visitCount: number; minutes: number };

/** 달력 날 칸 하나 */
export type StatsDay = {
  /** 방문 완료한 서비스(메뉴 이름)별 건수. 그날 먼저 방문 완료로 처리한 서비스부터 */
  services: { menuName: string; count: number }[];
  /** 방문 완료 밖의 거래 종류별 건수(칩 순서대로) */
  kinds: { kind: StatsKind; count: number }[];
  /** 살린 시간(분) */
  minutes: number;
};

/** 날 칸에 종류 이름으로 보여 주는 거래(방문 완료 sale은 서비스 이름으로 보여 준다) */
export type StatsKind = Exclude<SettlementItemViewKind, 'sale'>;

/** 그 달 정산 내역 합계 중 통계에 쓰는 것(정산할 금액이 있는 거래 수, 정산액 합, 아직 떼지 못한 패널티). 못 읽으면 null */
export type StatsPayout = {
  count: number;
  payoutAmount: number | null;
  outstandingPenalty: number;
} | null;

/** 서비스 칩 다음 종류 칩 순서. 받은 돈이 생긴 거래부터, 정산할 금액이 없는 거래는 뒤로 */
export const STATS_KIND_ORDER: readonly StatsKind[] = [
  'no_show',
  'penalty',
  'agreed_cancel',
  'owner_cancel',
  'void',
];

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 주소의 month. 모양이 맞고 이번 달 이후가 아니면 그 달, 아니면 이번 달(한국 달) */
export function resolveStatsMonth(value: string | undefined, now: Date): string {
  const thisMonth = currentMonth(now);
  // 'YYYY-MM'은 글자 순서가 달 순서와 같다
  return value && MONTH_PATTERN.test(value) && value <= thisMonth ? value : thisMonth;
}

/** 통계 주소. 이번 달이면 month를 쓰지 않는다 */
export function statsHref(month: string, now: Date): string {
  return month === currentMonth(now) ? '/owner/stats' : `/owner/stats?month=${month}`;
}

/** 다음 달 버튼을 둘지. 아직 오지 않은 달은 볼 것이 없어서 이번 달까지만 */
export function hasNextStatsMonth(month: string, now: Date): boolean {
  return shiftMonth(month, 1) <= currentMonth(now);
}

/** 달 'YYYY-MM'의 한국 시간 1일 0시부터 다음 달 1일 0시 전까지 */
export function kstMonthBounds(month: string): { from: Date; to: Date } {
  const firstDay = (key: string) => {
    const [year, monthNumber] = key.split('-').map(Number);
    return kstToUtc({ year, month: monthNumber, day: 1, hour: 0, minute: 0 });
  };
  return { from: firstDay(month), to: firstDay(shiftMonth(month, 1)) };
}

/**
 * 날 칸 값. 거래는 처리·취소 시각(occurredAt)의 한국 날짜에, 살린 시간은 방문 처리일에 놓는다.
 * 방문 완료(sale)는 서비스 이름별로, 나머지는 종류별로 센다. 거래도 방문도 없는 날은 넣지 않는다
 */
export function buildStatsDays(
  items: readonly Pick<SettlementItemView, 'kind' | 'occurredAt' | 'menuName'>[],
  visits: readonly VisitDay[],
): Map<string, StatsDay> {
  type Counts = { services: Map<string, number>; kinds: Map<StatsKind, number> };
  const counts = new Map<string, Counts>();
  // 정산 내역은 늦은 것부터 오므로, 서비스 칩이 그날 먼저 처리한 순서가 되게 이른 것부터 센다
  const ordered = [...items].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  for (const item of ordered) {
    const dateKey = kstDateKey(new Date(item.occurredAt));
    const day = counts.get(dateKey) ?? { services: new Map(), kinds: new Map() };
    if (item.kind === 'sale') {
      day.services.set(item.menuName, (day.services.get(item.menuName) ?? 0) + 1);
    } else {
      day.kinds.set(item.kind, (day.kinds.get(item.kind) ?? 0) + 1);
    }
    counts.set(dateKey, day);
  }
  const minutes = new Map(visits.map((visit) => [visit.dateKey, visit.minutes]));
  const days = new Map<string, StatsDay>();
  for (const dateKey of new Set([...counts.keys(), ...minutes.keys()])) {
    const day = counts.get(dateKey);
    days.set(dateKey, {
      services: [...(day?.services ?? [])].map(([menuName, count]) => ({ menuName, count })),
      kinds: STATS_KIND_ORDER.flatMap((kind) => {
        const count = day?.kinds.get(kind) ?? 0;
        return count > 0 ? [{ kind, count }] : [];
      }),
      minutes: minutes.get(dateKey) ?? 0,
    });
  }
  return days;
}

/** 서비스 칩 글자. 한 번이면 이름만, 여러 번이면 "여성 커트 (2)" */
export function serviceChipText(service: { menuName: string; count: number }): string {
  return service.count > 1 ? `${service.menuName} (${service.count})` : service.menuName;
}

/** 그 달 방문 완료 합계 */
export function sumVisits(visits: readonly VisitDay[]): { visitCount: number; minutes: number } {
  return visits.reduce(
    (sum, visit) => ({
      visitCount: sum.visitCount + visit.visitCount,
      minutes: sum.minutes + visit.minutes,
    }),
    { visitCount: 0, minutes: 0 },
  );
}

/** 살린 시간. 예: "5시간 30분". 없으면 "0분" */
export function savedTimeText(minutes: number): string {
  return minutes > 0 ? formatDuration(minutes) : '0분';
}

/** 추가 수입. 예: "137,900원", 결제 수수료율이 정해지기 전에는 "[미정]", 못 읽으면 "-" */
export function statsPayoutText(payout: StatsPayout): string {
  return payout ? wonOrUnknown(payout.payoutAmount) : '-';
}

/** 추가 수입 아래 작은 글씨. 거래 수, 또는 못 읽었다는 안내 */
export function statsPayoutCaption(payout: StatsPayout): string {
  return payout ? `수수료를 뗀 정산액 · 거래 ${payout.count}건` : '정산 내역을 불러오지 못했어요';
}

/**
 * 합계 아래 안내. 결제 수수료율이 정해지기 전이라 [미정]이면 그 이유,
 * 아직 떼지 못한 원장님 사정 취소 패널티가 있으면 이 금액은 패널티를 떼기 전이라는 것
 */
export function statsSummaryNotes(payout: StatsPayout): string[] {
  if (!payout) return [];
  const notes: string[] = [];
  if (payout.payoutAmount === null) notes.push(UNKNOWN_FEE_NOTE);
  if (payout.outstandingPenalty > 0) {
    notes.push(`남은 패널티(${formatWon(payout.outstandingPenalty)})를 떼기 전 금액이에요.`);
  }
  return notes;
}

/** 날 칸을 누르면 여는 그날 거래 내역 */
export function dayItemsHref(dateKey: string): string {
  return settlementsHref({ from: dateKey, to: dateKey }, { view: 'items' });
}
