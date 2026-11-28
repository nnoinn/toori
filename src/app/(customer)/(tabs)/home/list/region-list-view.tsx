'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoaderCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';
import { SlotList } from '@/features/map/slot-list/slot-list';
import type { SlotSort } from '@/features/map/slot-list/sort';

import { searchListHref } from '../search-rules';
import { useRegionSlots } from './use-region-slots';

type RegionListViewProps = {
  /** 범위 시·군·구 코드(바뀌면 다시 불러온다) */
  areaCode: string;
  /** 제목에 붙일 범위 이름. 예: 안산시 단원구, 내 위치 · 안산시 단원구 */
  areaLabel: string;
  /** 검색어(C-210, 주소창 ?q=를 다듬은 것). 없으면 null */
  keyword: string | null;
  sort: SlotSort;
  /** 서버가 준 "지금"(ISO). 목록을 받기 전 카드 남은 시간 기준 */
  serverNow: string;
  /** 매물이 없을 때 안내 아래에 둘 것(새 매물 알림 권유, C-208) */
  emptyAction?: React.ReactNode;
};

/**
 * 지도 없는 매물 목록 (#215 2장). 고른 동네(또는 내 위치가 속한 시·군·구) 안의 매물을 필터·정렬로 본다.
 * 다시 불러오는 동안 이전 목록을 두고 제목 옆에 작은 표시만, 실패하면 목록 위에 안내와 '다시 시도'(지도 홈과 같게).
 * 검색 중이면(C-210) 제목에 검색어와 [검색어 지우기]를 두고, 결과가 없으면 같은 빈 화면(C-208)에 검색 안내를 쓴다
 */
export function RegionListView({
  areaCode,
  areaLabel,
  keyword,
  sort,
  serverNow,
  emptyAction,
}: RegionListViewProps) {
  const search = useSearchParams().toString();
  const list = useRegionSlots({ areaCode, search });
  const quoted = keyword ? `'${keyword}'` : null;

  return (
    <section aria-label="매물 목록" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 md:px-0">
        <h1 className="font-semibold">
          {areaLabel} {quoted ? `${quoted} ` : ''}매물
          {list.total === null ? '' : ` ${list.total}개`}
        </h1>
        {keyword ? (
          // 검색만 풀고 필터·정렬은 그대로 둔다
          <Link
            href={searchListHref('', new URLSearchParams(search))}
            className="flex h-8 items-center gap-1 rounded-full border bg-card px-3 text-xs text-muted-foreground hover:text-foreground"
          >
            검색어 지우기
            <X className="size-3.5" aria-hidden />
          </Link>
        ) : null}
        {list.refreshing ? (
          <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
            불러오는 중…
          </span>
        ) : null}
      </div>
      {list.refreshError ? (
        <div
          role="alert"
          className="mx-4 flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm md:mx-0"
        >
          <span>{list.refreshError}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:h-10"
            onClick={list.retry}
          >
            다시 시도
          </Button>
        </div>
      ) : null}
      <div>
        <SlotList
          items={list.items}
          serverNow={list.serverNow ?? serverNow}
          sort={sort}
          status={list.status}
          errorMessage={list.errorMessage}
          onRetry={list.retry}
          hasMore={list.hasMore}
          loadingMore={list.loadingMore}
          onLoadMore={list.loadMore}
          empty={
            quoted ? (
              <EmptyState
                title={`${quoted}에 맞는 매물이 없어요`}
                description="다른 이름으로 찾거나 필터를 바꿔 보세요. 샵 이름·메뉴 이름으로 찾을 수 있어요."
                action={emptyAction}
              />
            ) : (
              <EmptyState
                title="이 동네에 지금 올라온 매물이 없어요"
                description="필터를 바꾸거나 다른 동네를 골라 보세요."
                action={emptyAction}
              />
            )
          }
        />
      </div>
    </section>
  );
}
