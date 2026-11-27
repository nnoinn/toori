import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { ensureOwnerPage } from '@/server/auth';
import { readShopReviewStatus } from '@/server/shops/review-store';

import { JoinedNotice } from '../join/joined-notice';
import { startOfKstDay } from '@/lib/time';
import { toDashboardSort } from './dashboard/dashboard';
import {
  selectDashboardSlots,
  selectDashboardWindows,
  selectNeedsVisitRecord,
} from './dashboard/dashboard-store';
import { OwnerDashboard } from './dashboard/owner-dashboard';
import { OwnerPage } from './owner-page';
import { ReviewStatusCard } from './review-status-card';
import { checklistFor, isChecklistDone } from './tutorial/checklist';
import { TutorialChecklist } from './tutorial/tutorial-checklist';
import { selectTutorialProgress } from './tutorial/tutorial-store';

export const metadata: Metadata = { title: '대시보드' };

const PAGE_PATH = '/owner';

type SearchParams = Promise<{ sort?: SearchValue }>;

// 원장님 대시보드(O9, S-401). 입점 승인 전에는 입점 상태 안내(O7 ②)를 보여준다.
// 입점 신청 직후에는 "입점 신청을 마쳤어요" 안내 상자가 잠깐 뜬다(O7 ①).
// 맨 위에는 튜토리얼 체크 목록(S-412)을 승인 전·후 모두 둔다. 다 마쳤으면 그리지 않는다.
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
  const [review, progress] = await Promise.all([
    readShopReviewStatus(db, auth.shopId),
    selectTutorialProgress(db, auth.shopId),
  ]);
  const steps = checklistFor(review, progress);
  const checklist = isChecklistDone(steps) ? null : (
    <TutorialChecklist shopId={auth.shopId} steps={steps} />
  );
  if (review && review.status !== 'approved') {
    return (
      <>
        {checklist}
        <ReviewStatusCard review={review} />
      </>
    );
  }

  const sort = toDashboardSort(firstParam((await searchParams).sort));
  const now = await getRequestNow();
  const [slots, windows, needsVisit] = await Promise.all([
    selectDashboardSlots(db, auth.shopId, startOfKstDay(now)),
    selectDashboardWindows(db, auth.shopId, startOfKstDay(now), now),
    selectNeedsVisitRecord(db, auth.shopId, now),
  ]);
  return (
    <>
      {checklist}
      <OwnerDashboard
        shopId={auth.shopId}
        nowIso={now.toISOString()}
        slots={slots}
        windows={windows}
        needsVisit={needsVisit}
        sort={sort}
      />
    </>
  );
}
