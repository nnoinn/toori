import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getCustomerLocation } from '@/features/map/location';
import { FAVORITE_SLOT_LIMIT, selectFavoriteSlots } from '@/features/map/slot-list/queries';
import { SlotList } from '@/features/map/slot-list/slot-list';
import { getRequestNow } from '@/lib/request-time';
import { ensureCustomerPage } from '@/server/auth';

import { countFavoriteShops } from './store';

export const metadata: Metadata = { title: '찜한 샵 매물' };

const PATH = '/home/favorites';

// 찜한 샵 매물 (#215 2장, C-209). 주소: /home/favorites. 고객 홈(/home)에서 골라 들어온다.
// 찜한 샵의 지금 예약할 수 있는 매물을 시작이 가까운 순으로 보여준다(목록·지도와 같은 조건).
// 찜은 고객 계정에 저장하므로 로그인이 필요하다. 로그인 뒤 이 화면으로 돌아온다
export default function FavoritesPage() {
  return (
    <main className="flex flex-1 flex-col gap-3 py-3 md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
      <Suspense fallback={<LoadingCards count={3} className="px-4 md:px-0" />}>
        <FavoritesContent />
      </Suspense>
    </main>
  );
}

async function FavoritesContent() {
  const { customerId } = await ensureCustomerPage(PATH);
  const [location, now] = await Promise.all([getCustomerLocation(), getRequestNow()]);
  const db = getDb();
  const [shopCount, items] = await Promise.all([
    countFavoriteShops(db, customerId),
    // 위치·동네를 골라 두었으면 거리도 같이 보여준다
    selectFavoriteSlots(db, { customerId, now, origin: location?.point ?? null }),
  ]);

  if (shopCount === 0) {
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
        <h1 className="font-semibold">찜한 샵 매물 {items.length}개</h1>
        <p className="text-sm text-muted-foreground">
          찜한 샵 {shopCount}곳의 지금 예약할 수 있는 매물을 시작이 가까운 순으로 보여줘요
          {items.length >= FAVORITE_SLOT_LIMIT ? `(${FAVORITE_SLOT_LIMIT}개까지)` : ''}.
        </p>
      </div>
      <SlotList
        items={items}
        serverNow={now.toISOString()}
        empty={
          <EmptyState
            title="찜한 샵에 지금 올라온 매물이 없어요"
            description="찜한 샵에 새 매물이 올라오면 여기에 보여요."
          />
        }
      />
    </section>
  );
}
