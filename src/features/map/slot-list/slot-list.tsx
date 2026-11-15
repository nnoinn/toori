'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { SlotCard } from '@/components/ui/slot-card';
import { ErrorState, LoadingTiles } from '@/components/ui/state';

import { formatDistance } from './distance';
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
   * 카드를 몇 칸으로 놓을지(11/15 회의, 위에 사진이 있는 카드).
   * page: 폰 2칸, 태블릿 3칸, 1024px 4칸, 1280px 5칸(매물 목록·찜한 샵 매물). panel: 늘 2칸(지도 옆 칸, 폰의 지도 아래 목록).
   * PC는 카드가 너무 커 보이지 않게 사진을 4:3으로 낮춘다(폰은 정사각형)
   */
  columns?: 'page' | 'panel';
};

const GRID_CLASS = {
  page: 'px-4 md:grid-cols-3 md:px-0 lg:grid-cols-4 xl:grid-cols-5',
  panel: 'px-4',
} as const;

const IMAGE_SIZES = {
  page: '(min-width: 1280px) 220px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw',
  panel: '(min-width: 1024px) 240px, (min-width: 768px) 190px, 50vw',
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

/** 매물 카드 목록 (J4, C-204). 시간대 매물(#308)은 시간대 카드로 섞여 있다. 끝에 닿으면 다음 20개를 부른다(D8) */
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
        <LoadingTiles count={4} className={GRID_CLASS[columns]} />
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
      ) : (
        // 위에 사진이 있는 카드를 여러 칸으로 놓는다(11/15 회의). 폰은 화면 끝에 붙지 않게 양옆 16px 여백을 둔다
        <ul className={cn('grid grid-cols-2 gap-3', GRID_CLASS[columns])}>
          {items.map((item) => (
            <li key={listItemKey(item)}>
              {item.kind === 'slot' ? (
                <SlotCard
                  layout="tile"
                  imageSizes={IMAGE_SIZES[columns]}
                  href={`/slots/${item.slotId}`}
                  imageUrl={item.imageUrl}
                  shopName={item.shopName}
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
                  imageSizes={IMAGE_SIZES[columns]}
                  href={`/windows/${item.windowId}`}
                  imageUrl={item.imageUrl}
                  shopName={item.shopName}
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
      )}
      {status === 'ready' && hasMore ? (
        <div ref={sentinelRef} className="py-2">
          {loadingMore ? <LoadingTiles count={2} className={GRID_CLASS[columns]} /> : null}
        </div>
      ) : null}
    </div>
  );
}
