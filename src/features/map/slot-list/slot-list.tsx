'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { SlotCard } from '@/components/ui/slot-card';
import { ErrorState, LoadingCards } from '@/components/ui/state';

import { formatDistance } from './distance';
import { applySortToSearch, SLOT_SORTS, type SlotSort } from './sort';
import type { SlotListItem } from './types';

type SlotListProps = {
  items: SlotListItem[];
  /** 서버가 준 "지금"(ISO). 남은 시간 계산 기준 */
  serverNow: string;
  sort: SlotSort;
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
};

/** 정렬 탭 (C-205). 고른 정렬은 주소창에 저장한다 */
export function SortTabs({ sort }: { sort: SlotSort }) {
  const router = useRouter();

  function select(next: SlotSort) {
    if (next === sort) return;
    const query = applySortToSearch(new URLSearchParams(window.location.search), next).toString();
    router.replace(query ? `/?${query}` : '/', { scroll: false });
  }

  return (
    <div role="tablist" aria-label="정렬" className="flex gap-1 px-3">
      {SLOT_SORTS.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={sort === item.key}
          className={cn(
            'rounded-full px-3 py-1 text-sm',
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

/** 매물 카드 목록 (J4, C-204). 끝에 닿으면 다음 20개를 부른다(D8) */
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
      <SortTabs sort={sort} />
      {status === 'loading' ? (
        <LoadingCards count={3} />
      ) : status === 'error' ? (
        <ErrorState
          description={errorMessage}
          action={
            onRetry ? (
              <Button type="button" variant="outline" onClick={onRetry}>
                다시 시도
              </Button>
            ) : undefined
          }
        />
      ) : items.length === 0 ? (
        empty
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.slotId}>
              <SlotCard
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
            </li>
          ))}
        </ul>
      )}
      {status === 'ready' && hasMore ? (
        <div ref={sentinelRef} className="py-2">
          {loadingMore ? <LoadingCards count={1} /> : null}
        </div>
      ) : null}
    </div>
  );
}
