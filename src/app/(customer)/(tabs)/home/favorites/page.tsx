import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState, LoadingList } from '@/components/ui/state';
import { getDb } from '@/db';
import { getCustomerLocation } from '@/features/map/location';
import {
  FAVORITE_SLOT_LIMIT,
  selectFavoriteShops,
  selectFavoriteSlots,
} from '@/features/map/slot-list/queries';
import { ShopGroupList } from '@/features/map/slot-list/shop-group';
import { buildFavoriteGroups } from '@/features/map/slot-list/shop-groups';
import { getRequestNow } from '@/lib/request-time';
import { ensureCustomerPage } from '@/server/auth';

export const metadata: Metadata = { title: '찜한 샵 매물' };

const PATH = '/home/favorites';

// 찜한 샵 매물 (#215 2장, C-209). 주소: /home/favorites. 고객 홈(/home)에서 골라 들어온다.
// 찜한 샵마다 묶어서(11/15 회의 3번) 그 샵의 지금 예약할 수 있는 매물을 시작이 가까운 순으로 보여준다(목록·지도와 같은 조건).
// 매물이 있는 샵이 앞(가장 빠른 매물 순), 지금 매물이 없는 샵은 뒤(최근에 찜한 순)다. 3개가 넘으면 접는다.
// 찜은 고객 계정에 저장하므로 로그인이 필요하다. 로그인 뒤 이 화면으로 돌아온다
export default function FavoritesPage() {
  return (
    <main className="flex flex-1 flex-col gap-3 py-3 md:mx-auto md:w-full md:max-w-2xl md:px-6 md:py-6">
      <Suspense
        fallback={
          <LoadingList count={4} className="overflow-hidden bg-card md:rounded-2xl md:border" />
        }
      >
        <FavoritesContent />
      </Suspense>
    </main>
  );
}

async function FavoritesContent() {
  const { customerId } = await ensureCustomerPage(PATH);
  const [location, now] = await Promise.all([getCustomerLocation(), getRequestNow()]);
  const db = getDb();
  // 위치·동네를 골라 두었으면 거리도 같이 보여준다
  const origin = location?.point ?? null;
  const [shops, items] = await Promise.all([
    selectFavoriteShops(db, { customerId, origin }),
    selectFavoriteSlots(db, { customerId, now, origin }),
  ]);

  if (shops.length === 0) {
    return (
      <>
        {/* 빈 화면에도 화면 제목을 둔다(화면 읽기 프로그램용) */}
        <h1 className="sr-only">찜한 샵 매물</h1>
        <EmptyState
          title="아직 찜한 샵이 없어요"
          description="매물을 보다가 샵 정보의 '찜'을 누르면 그 샵의 매물을 여기서 모아 볼 수 있어요."
          action={
            <Link href="/home/list" className={buttonVariants({ className: 'max-md:h-10' })}>
              매물 목록 보기
            </Link>
          }
        />
      </>
    );
  }

  return (
    <section aria-label="찜한 샵 매물" className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-4 md:px-0">
        <h1 className="font-semibold">찜한 샵 {shops.length}곳</h1>
        <p className="text-sm text-muted-foreground">
          샵마다 지금 예약할 수 있는 매물을 시작이 가까운 순으로 보여줘요
          {items.length >= FAVORITE_SLOT_LIMIT ? `(모두 ${FAVORITE_SLOT_LIMIT}개까지)` : ''}.
        </p>
      </div>
      <ShopGroupList
        groups={buildFavoriteGroups(shops, items)}
        serverNow={now.toISOString()}
        frameClassName="overflow-hidden bg-card md:rounded-2xl md:border"
      />
    </section>
  );
}
