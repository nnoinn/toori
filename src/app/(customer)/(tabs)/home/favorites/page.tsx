import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cn } from 'cn';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState, LoadingList } from '@/components/ui/state';
import { getDb } from '@/db';
import { getCustomerLocation } from '@/features/map/location';
import { FAVORITE_SLOT_LIMIT, selectFavoriteSlots } from '@/features/map/slot-list/queries';
import { ShopGroupList } from '@/features/map/slot-list/shop-group';
import {
  groupByShopInOrder,
  INTEREST_GROUP_PREVIEW_COUNT,
} from '@/features/map/slot-list/shop-groups';
import { ListItemRow } from '@/features/map/slot-list/slot-list';
import { listItemKey } from '@/features/map/slot-list/types';
import { getRequestNow } from '@/lib/request-time';
import { ensureCustomerPage } from '@/server/auth';

import {
  INTEREST_PATH,
  INTEREST_TABS,
  type InterestTab,
  interestTabHref,
  parseInterestTab,
} from './interest-tabs';
import { INTEREST_SLOT_LIMIT, selectInterestedSlots } from './slot-interest-store';
import { countFavoriteShops } from './store';

export const metadata: Metadata = { title: '관심' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FRAME = 'overflow-hidden bg-card md:rounded-2xl md:border';

// 관심 (#215 2장, C-209, C-211). 주소: /home/favorites(그대로). 고객 홈(/home) [관심]에서 들어온다.
// [매물 보기](기본, ?tab 없음)와 [샵 보기](?tab=shops) 두 탭이다(C-211).
// - 매물 보기: 관심 표시한 매물을 최근에 표시한 순으로. 마감된 매물은 흐리게 아래 '마감된 매물' 칸(slot-interest-store.ts)
// - 샵 보기: 관심 샵마다 묶어서(11/15 회의 3번) 그 샵의 지금 예약할 수 있는 매물을 시작이 가까운 순으로 2개까지 보여 주고
//   더 있으면 [매물 N개 더 보기]로 편다. 지금 매물이 없는 관심 샵은 보여주지 않는다(11/18 정찬형)
// 관심은 고객 계정에 저장하므로 로그인이 필요하다. 로그인 뒤 이 화면으로 돌아온다
export default function FavoritesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-3 py-3 md:mx-auto md:w-full md:max-w-2xl md:px-6 md:py-6">
      <Suspense fallback={<LoadingList count={4} className={FRAME} />}>
        <FavoritesContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function FavoritesContent({ searchParams }: { searchParams: SearchParams }) {
  const { customerId } = await ensureCustomerPage(INTEREST_PATH);
  const tab = parseInterestTab((await searchParams).tab);
  return (
    <>
      <h1 className="px-4 text-lg font-bold md:px-0">관심</h1>
      <InterestTabs current={tab} />
      {tab === 'slots' ? (
        <InterestSlots customerId={customerId} />
      ) : (
        <InterestShops customerId={customerId} />
      )}
    </>
  );
}

/** [매물 보기]·[샵 보기]. 주소창 ?tab= 으로 바꾼다(뒤로 가기로 돌아올 수 있게) */
function InterestTabs({ current }: { current: InterestTab }) {
  return (
    <nav aria-label="관심 보기" className="flex gap-1 px-4 md:px-0">
      {INTEREST_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={interestTabHref(tab.key)}
          aria-current={tab.key === current ? 'page' : undefined}
          className={cn(
            'flex h-9 items-center rounded-full px-4 text-sm max-md:h-10',
            tab.key === current
              ? 'bg-foreground font-semibold text-background'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

const listLink = (
  <Link href="/home/list" className={buttonVariants({ className: 'max-md:h-10' })}>
    매물 목록 보기
  </Link>
);

/** [매물 보기]: 관심 매물. 지금 예약할 수 있는 매물 위, 마감된 매물은 흐리게 아래 칸 */
async function InterestSlots({ customerId }: { customerId: string }) {
  const now = await getRequestNow();
  const { open, closed } = await selectInterestedSlots(getDb(), { customerId, now });
  const serverNow = now.toISOString();

  if (open.length === 0 && closed.length === 0) {
    return (
      <EmptyState
        title="아직 관심 매물이 없어요"
        description="매물 상세의 '관심 매물'을 누르면 그 매물을 여기서 모아 볼 수 있어요."
        action={listLink}
      />
    );
  }

  return (
    <section aria-label="관심 매물" className="flex flex-col gap-4">
      <p className="px-4 text-sm text-muted-foreground md:px-0">
        최근에 관심 표시한 순이에요
        {open.length + closed.length >= INTEREST_SLOT_LIMIT
          ? `(모두 ${INTEREST_SLOT_LIMIT}개까지)`
          : ''}
        .
      </p>
      {open.length > 0 ? (
        <ul aria-label="지금 예약할 수 있는 관심 매물" className={cn(FRAME, '[&>li]:border-b')}>
          {open.map((item) => (
            <li key={listItemKey(item)}>
              <ListItemRow item={item} serverNow={serverNow} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mx-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground md:mx-0">
          지금 예약할 수 있는 관심 매물이 없어요.
        </p>
      )}
      {closed.length > 0 ? (
        <section aria-label="마감된 매물" className="flex flex-col gap-2">
          <h2 className="px-4 text-sm font-semibold text-muted-foreground md:px-0">
            마감된 매물 {closed.length}개
          </h2>
          {/* 흐리게 보여 주되 눌러서 상세는 볼 수 있다 */}
          <ul className={cn(FRAME, 'opacity-50 [&>li]:border-b')}>
            {closed.map((item) => (
              <li key={listItemKey(item)}>
                <ListItemRow item={item} serverNow={serverNow} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

/** [샵 보기]: 관심 샵마다 지금 예약할 수 있는 매물을 2개까지 */
async function InterestShops({ customerId }: { customerId: string }) {
  const [location, now] = await Promise.all([getCustomerLocation(), getRequestNow()]);
  const db = getDb();
  const [shopCount, items] = await Promise.all([
    countFavoriteShops(db, customerId),
    // 위치·동네를 골라 두었으면 거리도 같이 보여준다
    selectFavoriteSlots(db, { customerId, now, origin: location?.point ?? null }),
  ]);

  if (shopCount === 0) {
    return (
      <EmptyState
        title="아직 관심 샵이 없어요"
        description="매물을 보다가 샵 이름 옆 '관심 샵'을 누르면 그 샵의 매물을 여기서 모아 볼 수 있어요."
        action={listLink}
      />
    );
  }

  const groups = groupByShopInOrder(items);
  return (
    <section aria-label="관심 샵" className="flex flex-col gap-2">
      <p className="px-4 text-sm text-muted-foreground md:px-0">
        관심 샵 {shopCount}곳 중 지금 예약할 수 있는 매물이 있는 {groups.length}곳이에요. 샵마다
        시작이 가까운 순으로 {INTEREST_GROUP_PREVIEW_COUNT}개까지 보여줘요
        {items.length >= FAVORITE_SLOT_LIMIT ? `(모두 ${FAVORITE_SLOT_LIMIT}개까지)` : ''}.
      </p>
      {groups.length === 0 ? (
        <EmptyState
          title="관심 샵에 지금 올라온 매물이 없어요"
          description="관심 샵에 새 매물이 올라오면 여기에 보여요."
        />
      ) : (
        <ShopGroupList
          groups={groups}
          serverNow={now.toISOString()}
          frameClassName={FRAME}
          previewCount={INTEREST_GROUP_PREVIEW_COUNT}
        />
      )}
    </section>
  );
}
