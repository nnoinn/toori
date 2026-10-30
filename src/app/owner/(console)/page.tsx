import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { ensureOwnerPage } from '@/server/auth';
import { readShopReviewStatus } from '@/server/shops/review-store';

import { JoinedNotice } from '../join/joined-notice';
import { ReviewStatusCard } from './review-status-card';

export const metadata: Metadata = { title: '원장님' };

const PAGE_PATH = '/owner';

// 원장님 대시보드(S-401). 정민석이 만든다. 대시보드는 O9에서 만들고, 지금은 입점 상태 안내(O7 ②)만 있다.
// 입점 신청 직후에는 "입점 신청을 마쳤어요" 안내 상자가 잠깐 뜬다(O7 ①)
export default function OwnerHomePage() {
  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">원장님 화면</h1>
      <Suspense fallback={<LoadingCards count={1} />}>
        <OwnerHomeContent />
      </Suspense>
      <JoinedNotice />
    </main>
  );
}

async function OwnerHomeContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const review = await readShopReviewStatus(getDb(), auth.shopId);
  if (review && review.status !== 'approved') return <ReviewStatusCard review={review} />;
  return <p className="text-muted-foreground">대시보드는 준비 중이에요.</p>;
}
