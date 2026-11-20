import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { ensureOwnerPage } from '@/server/auth';
import { readShopReviewStatus } from '@/server/shops/review-store';
import { getSettlementItems } from '@/server/settlements/get-settlement-items';

import { JoinedNotice } from '../join/joined-notice';
import { startOfKstDay } from '@/lib/time';
import { toDashboardSort } from './dashboard/dashboard';
import {
  selectDashboardSlots,
  selectDashboardWindows,
  selectNeedsVisitRecord,
} from './dashboard/dashboard-store';
import { kstMonthBounds, type MonthPayout } from './dashboard/month-summary';
import { MonthSummaryCard } from './dashboard/month-summary-card';
import { selectMonthVisitTime } from './dashboard/month-summary-store';
import { OwnerDashboard } from './dashboard/owner-dashboard';
import { OwnerPage } from './owner-page';
import { ReviewStatusCard } from './review-status-card';
import { currentMonth, monthRange } from './settlements/settlement-format';

export const metadata: Metadata = { title: '대시보드' };

const PAGE_PATH = '/owner';

type SearchParams = Promise<{ sort?: SearchValue }>;

// 원장님 대시보드(O9, S-401). 입점 승인 전에는 입점 상태 안내(O7 ②)를 보여준다.
// 맨 위 "이번 달 투리" 카드(S-504): 이번 달 살린 시간과 추가 수입(정산 화면 거래 내역과 같은 달·같은 숫자).
// 입점 신청 직후에는 "입점 신청을 마쳤어요" 안내 상자가 잠깐 뜬다(O7 ①).
// 주소: /owner?sort=start_desc|created_desc (매물 목록 정렬, 없으면 시작 시각 빠른 순, #358 5번). PC 기준
export default function OwnerHomePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <OwnerPage title="대시보드" width="wide">
      <Suspense fallback={<LoadingCards count={3} />}>
        <OwnerHomeContent searchParams={searchParams} />
      </Suspense>
      <JoinedNotice />
    </OwnerPage>
  );
}

/** 입점 승인 전이면 입점 상태 안내, 승인됐으면 오늘 0시 이후 매물·시간대와 처리 필요 예약으로 대시보드를 그린다 */
async function OwnerHomeContent({ searchParams }: { searchParams: SearchParams }) {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const db = getDb();
  const review = await readShopReviewStatus(db, auth.shopId);
  if (review && review.status !== 'approved') return <ReviewStatusCard review={review} />;

  const sort = toDashboardSort(firstParam((await searchParams).sort));
  const now = await getRequestNow();
  const month = currentMonth(now);
  const [slots, windows, needsVisit, monthVisit, monthItems] = await Promise.all([
    selectDashboardSlots(db, auth.shopId, startOfKstDay(now)),
    selectDashboardWindows(db, auth.shopId, startOfKstDay(now), now),
    selectNeedsVisitRecord(db, auth.shopId, now),
    selectMonthVisitTime(db, auth.shopId, kstMonthBounds(month)),
    // 추가 수입은 정산 화면과 같은 함수·같은 달로 읽어서 숫자가 같다
    getSettlementItems({ shopId: auth.shopId, ...monthRange(month) }),
  ]);
  // 정산 내역을 못 읽어도 대시보드는 그린다(카드에 "불러오지 못했어요")
  const monthPayout: MonthPayout = monthItems.ok
    ? {
        count: monthItems.data.summary.count,
        payoutAmount: monthItems.data.summary.payoutAmount,
        outstandingPenalty: monthItems.data.outstandingPenalty,
      }
    : null;
  return (
    <div className="flex flex-col gap-4">
      <MonthSummaryCard month={month} visit={monthVisit} payout={monthPayout} />
      <OwnerDashboard
        shopId={auth.shopId}
        nowIso={now.toISOString()}
        slots={slots}
        windows={windows}
        needsVisit={needsVisit}
        sort={sort}
      />
    </div>
  );
}
