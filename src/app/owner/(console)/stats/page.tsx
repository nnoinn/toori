import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { kstDateKey } from '@/lib/time';
import { ensureOwnerPage } from '@/server/auth';
import { getSettlementItems } from '@/server/settlements/get-settlement-items';

import { OwnerPage } from '../owner-page';
import {
  currentMonth,
  monthLabel,
  monthRange,
  settlementsHref,
  shiftMonth,
} from '../settlements/settlement-format';
import {
  buildStatsDays,
  hasNextStatsMonth,
  kstMonthBounds,
  resolveStatsMonth,
  savedTimeText,
  type StatsPayout,
  statsHref,
  statsPayoutCaption,
  statsPayoutText,
  statsSummaryNotes,
  sumVisits,
} from './stats';
import { StatsCalendar } from './stats-calendar';
import { selectVisitDays } from './stats-store';

export const metadata: Metadata = { title: '통계' };

const PAGE_PATH = '/owner/stats';

type SearchParams = Promise<{ month?: SearchValue }>;

// 원장님 월별 통계 (S-504, 11/20 정민석). 주소: /owner/stats?month=YYYY-MM(없으면 이번 달, 이번 달 뒤는 볼 수 없다).
// 위에 그 달 살린 시간·추가 수입, 아래에 달력(날마다 거래 종류별 건수와 살린 시간). 계산과 정한 것은 stats.ts.
// 추가 수입과 날 칸의 거래는 정산 내역 함수(getSettlementItems)를 같은 달로 읽어서 정산 화면과 숫자가 같다. PC 기준
export default function OwnerStatsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerPage
      title="통계"
      width="wide"
      description="투리로 채운 시간과 받을 돈을 달마다 봐요. 방문·노쇼 처리일이나 취소일에 놓여요. 날을 누르면 그날 거래 내역이 열려요."
    >
      <Suspense fallback={<LoadingCards count={2} />}>
        <StatsContent searchParams={searchParams} />
      </Suspense>
    </OwnerPage>
  );
}

async function StatsContent({ searchParams }: { searchParams: SearchParams }) {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const now = await getRequestNow();
  const month = resolveStatsMonth(firstParam((await searchParams).month), now);

  const [visits, monthItems] = await Promise.all([
    selectVisitDays(getDb(), auth.shopId, kstMonthBounds(month)),
    getSettlementItems({ shopId: auth.shopId, ...monthRange(month) }),
  ]);
  // 정산 내역을 못 읽어도 살린 시간은 보여 준다(추가 수입 "-", 날 칸은 살린 시간만)
  const payout: StatsPayout = monthItems.ok
    ? {
        count: monthItems.data.summary.count,
        payoutAmount: monthItems.data.summary.payoutAmount,
        outstandingPenalty: monthItems.data.outstandingPenalty,
      }
    : null;
  const items = monthItems.ok ? monthItems.data.items : [];
  const total = sumVisits(visits);
  const notes = statsSummaryNotes(payout);
  const excluded = items.some((item) => item.status === 'no_payout');

  return (
    <>
      <StatsNav month={month} now={now} />
      <Card>
        <CardContent className="flex flex-col gap-3">
          <dl className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">살린 시간</dt>
              <dd className="text-2xl font-bold tabular-nums">{savedTimeText(total.minutes)}</dd>
              <dd className="text-xs text-muted-foreground">방문 완료 {total.visitCount}건</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">추가 수입</dt>
              <dd className="text-2xl font-bold tabular-nums">{statsPayoutText(payout)}</dd>
              <dd className="text-xs text-muted-foreground">{statsPayoutCaption(payout)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap items-end justify-between gap-2 border-t pt-3">
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              {notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
              {excluded ? (
                <p>원장님 사정 취소처럼 정산할 금액이 없는 거래는 거래 수에 넣지 않아요.</p>
              ) : null}
            </div>
            <Link
              href={settlementsHref({ month }, { view: 'items' })}
              className="text-sm font-medium underline"
            >
              이 달 거래 내역 보기
            </Link>
          </div>
        </CardContent>
      </Card>
      <StatsCalendar
        month={month}
        days={buildStatsDays(items, visits)}
        todayKey={kstDateKey(now)}
      />
    </>
  );
}

/** [<] [이번 달] [>]와 보는 달. 이번 달 뒤로는 가지 않는다 */
function StatsNav({ month, now }: { month: string; now: Date }) {
  const isThisMonth = month === currentMonth(now);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="지난 달">
          <Link href={statsHref(shiftMonth(month, -1), now)}>
            <ChevronLeft aria-hidden />
          </Link>
        </Button>
        {isThisMonth ? (
          <Button variant="outline" disabled>
            이번 달
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={statsHref(currentMonth(now), now)}>이번 달</Link>
          </Button>
        )}
        {hasNextStatsMonth(month, now) ? (
          <Button asChild variant="outline" size="icon" aria-label="다음 달">
            <Link href={statsHref(shiftMonth(month, 1), now)}>
              <ChevronRight aria-hidden />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" disabled aria-label="다음 달">
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>
      <h2 className="text-lg font-semibold">{monthLabel(month)}</h2>
    </div>
  );
}
