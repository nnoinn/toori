import { Suspense } from 'react';

import { OwnerNav } from '@/components/ui/owner-nav';
import { getDb } from '@/db';
import { getCurrentAccount } from '@/server/auth';
import { readShopReviewStatus } from '@/server/shops/review-store';

// 원장님 화면 레이아웃(PC 기준, 폰에서는 위쪽 메뉴 버튼). 화면은 정민석 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
// 입점 승인 전이면 메뉴의 '매물 등록'을 잠근다(O7 ②, 연결 #13). 매물 등록 화면과 서버 함수도 따로 막는다.
// 접근 보호: proxy가 1차로 막고, 이 레이아웃과 서버 함수에서 requireOwner()로 한 번 더 확인한다(강규민, 로드맵 W3).
export default function OwnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
      {/* 입점 상태를 읽는 동안은 잠그지 않은 메뉴를 먼저 보여준다(로그인 확인은 <Suspense> 안에서, 기술 가이드 2장) */}
      <Suspense fallback={<OwnerNav />}>
        <OwnerNavWithReview />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

/** 입점 상태를 읽어 '매물 등록' 잠금을 정한다. 레이아웃은 화면을 옮겨도 다시 돌지 않아서, 승인된 뒤에는 새로고침하면 풀린다 */
async function OwnerNavWithReview() {
  const account = await getCurrentAccount();
  if (!account?.shopId) return <OwnerNav />;
  const review = await readShopReviewStatus(getDb(), account.shopId);
  return <OwnerNav canCreateSlot={review?.status === 'approved'} />;
}
