'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { SlotCard } from '@/components/ui/slot-card';
import { ErrorState, LoadingList } from '@/components/ui/state';

import { formatDistance } from './distance';
import { ShopGroupList } from './shop-group';
import { groupByShop } from './shop-groups';
import { applySortToSearch, SLOT_SORTS, type SlotSort } from './sort';
import { type ListItem, listItemKey } from './types';
import { WindowCard } from './window-card';

type SlotListProps = {
  items: ListItem[];
  /** 서버가 준 "지금"(ISO). 남은 시간 계산 기준 */
  serverNow: string;
  /** 고른 정렬. 없으면 정렬 탭을 숨긴다(찜한 샵 매물은 임박순만) */
  sort?: SlotSort;
  /** loading: 처음 불러오는 중, error: 불러오지 못함 */
  status?: 'ready' | 'loading' | 'error';
  errorMessage?: string;
  onRetry?: () => void;
  /** 더 불러올 매물이 있으면 목록 끝에 닿았을 때 onLoadMore를 부른다 */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** 매물이 없을 때 보여줄 것 */
  empty: React.ReactNode;
  /**
   * 목록 판 모양. 한 줄은 왼쪽 글 + 오른쪽 사진이고, 줄 사이는 구분선이다(지도 앱 장소 목록처럼, 11/18 정찬형).
   * page: 폰은 화면 폭, PC는 둥근 흰 판(매물 목록·찜한 샵 매물). panel: 지도 옆 칸, 폰의 지도 아래 목록. 둘 다 한 줄씩 쌓는다
   */
  columns?: 'page' | 'panel';
};

// 흰 판(샵 묶음 목록도 같이 쓴다). 줄마다 아래 구분선을 긋고, 마지막 줄의 선은 판 밖으로 밀어 숨긴다(-mb-px + overflow-hidden)
const FRAME_CLASS = {
  page: 'overflow-hidden bg-card md:rounded-2xl md:border',
  panel: 'overflow-hidden border-y bg-card md:border-b-0',
} as const;

/** 정렬 탭 (C-205). 고른 정렬은 주소창에 저장한다 */
export function SortTabs({ sort }: { sort: SlotSort }) {
  const router = useRouter();

  function select(next: SlotSort) {
    if (next === sort) return;
    const query = applySortToSearch(new URLSearchParams(window.location.search), next).toString();
    // 지금 화면 주소는 그대로 두고 주소 뒤 값만 바꾼다
    const path = window.location.pathname;
    router.replace(query ? `${path}?${query}` : path, { scroll: false });
  }

  return (
    <div role="tablist" aria-label="정렬" className="flex gap-1 px-3 max-md:px-4">
      {SLOT_SORTS.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={sort === item.key}
          className={cn(
            // 폰에서는 손가락으로 누르기 쉽게 높이를 키운다(40px)
            'rounded-full px-3 py-1 text-sm max-md:min-h-10',
            sort === item.key
              ? 'bg-foreground font-semibold text-background'
              : 'text-muted-foreground',
          )}
          onClick={() => select(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 매물 카드 목록 (J4, C-204). 시간대 매물(#308)은 시간대 카드로 섞여 있다. 끝에 닿으면 다음 20개를 부른다(D8).
 * 거리순(기본)은 같은 샵 매물이 붙어 오므로 샵별로 묶어 보여준다(11/18 정찬형). 할인율순·임박순·찜한 샵 매물은 매물 한 줄씩이다
 */
export function SlotList({
  items,
  serverNow,
  sort,
  status = 'ready',
  errorMessage,
  onRetry,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  empty,
  columns = 'page',
}: SlotListProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const grouped = sort === 'near';
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMoreRef.current?.();
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, items.length]);

  return (
    <div className="flex flex-col gap-2">
      {sort ? <SortTabs sort={sort} /> : null}
      {status === 'loading' ? (
        <LoadingList count={4} className={FRAME_CLASS[columns]} />
      ) : status === 'error' ? (
        <ErrorState
          description={errorMessage}
          action={
            onRetry ? (
              <Button type="button" variant="outline" className="max-md:h-10" onClick={onRetry}>
                다시 시도
              </Button>
            ) : undefined
          }
        />
      ) : items.length === 0 ? (
        empty
      ) : grouped ? (
        <ShopGroupList
          groups={groupByShop(items)}
          serverNow={serverNow}
          frameClassName={FRAME_CLASS[columns]}
        />
      ) : (
        <div className={FRAME_CLASS[columns]}>
          <ul className="-mb-px [&>li]:border-b">
            {items.map((item) => (
              <li key={listItemKey(item)}>
                {item.kind === 'slot' ? (
                  <SlotCard
                    layout="list"
                    href={`/slots/${item.slotId}`}
                    imageUrl={item.imageUrl}
                    shopName={item.shopName}
                    category={item.category}
                    menuName={item.menuName}
                    startAt={item.startAt}
                    serverNow={serverNow}
                    listPrice={item.listPrice}
                    salePrice={item.salePrice}
                    discountRate={item.discountRate}
                    badges={item.badges}
                    distanceText={formatDistance(item.distanceMeters)}
                  />
                ) : (
                  <WindowCard
                    href={`/windows/${item.windowId}`}
                    imageUrl={item.imageUrl}
                    shopName={item.shopName}
                    category={item.category}
                    firstMenuName={item.firstMenuName}
                    menuCount={item.menuCount}
                    startAt={item.startAt}
                    endAt={item.endAt}
                    maxDiscountRate={item.maxDiscountRate}
                    minSalePrice={item.minSalePrice}
                    badges={item.badges}
                    distanceText={formatDistance(item.distanceMeters)}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {status === 'ready' && hasMore ? (
        <div ref={sentinelRef} className="py-2">
          {loadingMore ? <LoadingList count={2} className={FRAME_CLASS[columns]} /> : null}
        </div>
      ) : null}
    </div>
  );
}
