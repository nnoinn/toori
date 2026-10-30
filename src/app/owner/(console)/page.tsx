import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ensureOwnerPage } from '@/server/auth';
import { readShopReviewStatus } from '@/server/shops/review-store';

import { JoinedNotice } from '../join/joined-notice';
import { startOfKstDay } from './dashboard/dashboard';
import { selectDashboardSlots, selectNeedsVisitRecord } from './dashboard/dashboard-store';
import { OwnerDashboard } from './dashboard/owner-dashboard';
import { ReviewStatusCard } from './review-status-card';

export const metadata: Metadata = { title: '대시보드' };

const PAGE_PATH = '/owner';

// 원장님 대시보드(O9, S-401). 입점 승인 전에는 입점 상태 안내(O7 ②)를 보여준다.
// 입점 신청 직후에는 "입점 신청을 마쳤어요" 안내 상자가 잠깐 뜬다(O7 ①). PC 기준
export default function OwnerHomePage() {
  return (
    <main className="flex w-full max-w-4xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">대시보드</h1>
      <Suspense fallback={<LoadingCards count={3} />}>
        <OwnerHomeContent />
      </Suspense>
      <JoinedNotice />
    </main>
  );
}

async function OwnerHomeContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const db = getDb();
  const review = await readShopReviewStatus(db, auth.shopId);
  if (review && review.status !== 'approved') return <ReviewStatusCard review={review} />;

  const now = await getRequestNow();
  const [slots, needsVisit] = await Promise.all([
    selectDashboardSlots(db, auth.shopId, startOfKstDay(now)),
    selectNeedsVisitRecord(db, auth.shopId, now),
  ]);
  return <OwnerDashboard nowIso={now.toISOString()} slots={slots} needsVisit={needsVisit} />;
}
