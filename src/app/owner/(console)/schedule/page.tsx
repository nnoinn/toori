import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { kstDateKey } from '@/lib/time';
import { ensureOwnerPage } from '@/server/auth';

import { OwnerPage } from '../owner-page';
import { addDaysToKey } from '../slots/calendar-days';
import { openSpans } from '../slots/slot-time';
import { ScheduleGrid } from './schedule-grid';
import { ScheduleLegend } from './schedule-legend';
import { ScheduleNav } from './schedule-nav';
import {
  minutesFromDayStart,
  placeByDay,
  resolveScheduleQuery,
  scheduleDays,
  verticalRange,
} from './schedule';
import { selectScheduleHours, selectScheduleSlots, selectScheduleWindows } from './schedule-store';

export const metadata: Metadata = { title: '예약 현황' };

const PAGE_PATH = '/owner/schedule';

type SearchParams = Promise<{ view?: SearchValue; date?: SearchValue }>;

// 원장님 예약 현황 캘린더 (S-402, #23 11/15 정민석 계획). 주(일~토)·일 단위 타임라인에 매물·시간대·예약을 보여준다.
// 주소: /owner/schedule?view=week|day&date=YYYY-MM-DD (없으면 이번 주). 지난 날짜도 넘겨 보고 거기서 예약 상세를 연다
// (11/9 정민석: 대시보드에 [지난] 탭을 두지 않는다). 매물은 대시보드와 같은 조건(ownerListedSlot, WINDOW-08). PC 기준
export default function OwnerSchedulePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerPage
      title="예약 현황"
      width="wide"
      description="올린 매물과 예약을 날짜·시간 순으로 봐요. 칸을 누르면 예약 상세나 매물 수정으로 가요."
    >
      <Suspense fallback={<LoadingCards count={3} />}>
        <ScheduleContent searchParams={searchParams} />
      </Suspense>
    </OwnerPage>
  );
}

async function ScheduleContent({ searchParams }: { searchParams: SearchParams }) {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const params = await searchParams;
  const now = await getRequestNow();
  const todayKey = kstDateKey(now);
  const query = resolveScheduleQuery(
    { view: firstParam(params.view), date: firstParam(params.date) },
    todayKey,
  );
  const days = scheduleDays(query);
  const from = new Date(`${days[0]}T00:00:00+09:00`);
  const to = new Date(`${addDaysToKey(days[days.length - 1], 1)}T00:00:00+09:00`);

  const db = getDb();
  const [hours, slots, windows] = await Promise.all([
    selectScheduleHours(db, auth.shopId),
    selectScheduleSlots(db, auth.shopId, { from, to, now }),
    selectScheduleWindows(db, auth.shopId, { from, to, now }),
  ]);
  const slotsByDay = placeByDay(slots, days);
  const windowsByDay = placeByDay(windows, days);
  const range = verticalRange(days, hours, [
    ...[...slotsByDay.values()].flat(),
    ...[...windowsByDay.values()].flat(),
  ]);
  const columns = days.map((dateKey) => ({
    dateKey,
    closed: openSpans(dateKey, hours)?.length === 0,
    slots: slotsByDay.get(dateKey) ?? [],
    windows: windowsByDay.get(dateKey) ?? [],
  }));
  const empty = slots.length === 0 && windows.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ScheduleNav query={query} todayKey={todayKey} />
      <ScheduleLegend />
      {empty ? (
        <p className="text-sm text-muted-foreground">
          {query.view === 'week' ? '이 주에는' : '이 날에는'} 올린 매물이 없어요.
        </p>
      ) : null}
      <ScheduleGrid
        view={query.view}
        columns={columns}
        range={range}
        todayKey={todayKey}
        nowMinute={minutesFromDayStart(todayKey, now.toISOString())}
      />
    </div>
  );
}
