'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoaderCircle, X } from 'lucide-react';
import { cn } from 'cn';

import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/state';

import { KakaoMap } from './kakao-map';
import { type SheetSize, useSheetDrag } from './sheet-drag';
import { SlotList } from './slot-list/slot-list';
import type { SlotSort } from './slot-list/sort';
import { useHomeSlots } from './slot-list/use-home-slots';
import type { LatLng, MapBounds } from './types';
import { useIsDesktop } from './use-is-desktop';

function isSameBounds(a: MapBounds, b: MapBounds): boolean {
  return (
    a.sw.lat === b.sw.lat && a.sw.lng === b.sw.lng && a.ne.lat === b.ne.lat && a.ne.lng === b.ne.lng
  );
}

type HomeExplorerProps = {
  center: LatLng;
  myLocation: LatLng | null;
  /** 지도 위 왼쪽 위에 띄울 것(동네 바꾸기 버튼) */
  header: React.ReactNode;
  sort: SlotSort;
  /** 서버가 준 "지금"(ISO). 목록을 받기 전 카드 남은 시간 기준 */
  serverNow: string;
};

/**
 * 홈 = 지도 + 목록 (J3·J4, C-201·C-204, #17 Q2).
 * 폰: 아래 목록 시트. 내림(손잡이만, 지도 크게) / 반(지도·목록 반반, 기본) / 전체(목록만) 3단계이고, 매물 개수는 손잡이에 보여준다(D13, 11/7 내림 추가).
 *   끌면 시트가 따라오고 놓으면 가장 가까운 단계(빠르게 튕기면 튕긴 쪽 다음 단계)에 붙는다. 누르면 내림 → 반 → 전체 → 반(sheet-drag.ts).
 * PC(md 이상): 지도는 왼쪽 전체, 목록은 오른쪽 고정 패널(폭 400px). 시트 크기 바꾸기는 쓰지 않는다(10/25 결정).
 * 지도를 움직이면 보이는 영역 안의 매물을 다시 불러온다(D4). 마커를 누르면 그 샵 매물만 보고, 지도를 움직이면 다시 전체다.
 * 다시 불러오는 동안 이전 핀·목록은 그대로 두고 제목 옆에 작은 표시만 한다. 실패하면 목록 위에 안내와 '다시 시도'(#199).
 */
export function HomeExplorer({ center, myLocation, header, sort, serverNow }: HomeExplorerProps) {
  const [sheet, setSheet] = useState<SheetSize>('half');
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useSheetDrag(sheet, setSheet, sheetRef);
  const dragging = drag.height !== null;
  const isDesktop = useIsDesktop();
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const search = useSearchParams().toString();

  const home = useHomeSlots({ bounds, search, shopId: selectedShopId });
  const selectedShop = home.shops.find((shop) => shop.shopId === selectedShopId) ?? null;
  const slotCount = selectedShop
    ? selectedShop.slotCount
    : home.shops.reduce((sum, shop) => sum + shop.slotCount, 0);
  // 목록 화면은 동네 전체를 세고 지도는 보이는 영역만 세서 숫자가 다를 수 있다. 그래서 전체일 때 "지도에 보이는"을 붙인다
  const count = home.shopsReady
    ? `${selectedShop ? '' : '지도에 보이는 '}매물 ${slotCount}개`
    : home.status === 'loading'
      ? '매물 불러오는 중'
      : '매물';
  const title = `${selectedShop ? `${selectedShop.name} · ` : ''}${count}`;
  const refreshing = home.refreshing ? (
    <span
      role="status"
      className="flex items-center gap-1 text-xs font-normal text-muted-foreground"
    >
      <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
      불러오는 중…
    </span>
  ) : null;

  return (
    <main className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom)-var(--hold-bar-h,0px))] flex-col overflow-hidden md:h-[calc(100dvh-4rem-var(--hold-bar-h,0px))] md:flex-row">
      <div
        className={cn(
          'relative',
          // 끄는 동안에는 시트 높이를 손가락이 정하고 지도는 남은 칸을 채운다
          dragging
            ? 'min-h-0 flex-1 overflow-hidden'
            : cn(
                'transition-[flex-basis] duration-200',
                sheet === 'full' ? 'h-0 flex-none overflow-hidden' : 'flex-1',
              ),
          // PC에서는 시트 크기와 상관없이 지도가 늘 보인다
          'md:h-auto md:flex-1',
        )}
      >
        <KakaoMap
          className="absolute inset-0"
          center={center}
          myLocation={myLocation}
          shops={home.shops}
          onBoundsChange={(next) => {
            // 핀을 다시 그려도 카카오 지도가 'idle'을 다시 보낸다. 영역이 그대로면 다시 불러오지 않는다
            // (그대로 두면 불러오기 → 핀 다시 그리기 → idle → 불러오기가 끝없이 반복된다)
            if (bounds && isSameBounds(bounds, next)) return;
            setBounds(next);
            setSelectedShopId(null);
          }}
          onSelectShop={(shopId) => {
            setSelectedShopId(shopId);
            setSheet('half');
          }}
          // 끄는 동안에는 지도 크기를 다시 재지 않는다(매번 다시 그리고 목록을 다시 부르지 않게). 놓으면 한 번 다시 잰다
          hidden={(sheet === 'full' || dragging) && !isDesktop}
        />
        <div className="absolute top-2 left-2 z-10 rounded-lg bg-background/90 shadow-sm">
          {header}
        </div>
      </div>

      <section
        ref={sheetRef}
        aria-label="매물 목록"
        style={dragging ? { height: drag.height ?? undefined } : undefined}
        className={cn(
          'flex flex-col rounded-t-2xl border-t bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.06)]',
          // 내림은 손잡이 높이만(아래 목록을 숨김). 크게(flex-1)는 min-h-0이 있어야 화면 높이 안에 머물고
          // 목록이 그 안에서 스크롤된다(없으면 목록 길이만큼 늘어나 화면 아래로 넘쳐 아래 매물을 못 본다)
          dragging || sheet === 'min' ? 'flex-none' : sheet === 'half' ? 'h-1/2' : 'min-h-0 flex-1',
          'md:h-auto md:w-[400px] md:flex-none md:rounded-none md:border-t-0 md:border-l md:shadow-none',
        )}
      >
        <button
          type="button"
          // touch-none: 끄는 동안 화면이 같이 스크롤되거나 새로고침되지 않게
          className="flex cursor-grab touch-none flex-col items-center gap-1.5 pt-2 pb-3 select-none active:cursor-grabbing md:hidden"
          aria-expanded={sheet !== 'min'}
          {...drag.handleProps}
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <span className="flex items-center gap-2 text-sm font-semibold">
            {title}
            {refreshing}
          </span>
          <span className="sr-only">
            {sheet === 'min'
              ? '목록 펼치기'
              : sheet === 'half'
                ? '목록 크게 보기'
                : '지도 같이 보기'}
          </span>
        </button>
        <div className="hidden items-center justify-between px-4 py-3 md:flex">
          <div className="flex items-center gap-2">
            <p className="font-semibold">{title}</p>
            {refreshing}
          </div>
          {selectedShop ? (
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground"
              onClick={() => setSelectedShopId(null)}
            >
              <X className="size-4" aria-hidden />
              전체 보기
            </button>
          ) : null}
        </div>
        {/* relative: 카드 안의 화면 낭독용 글자(sr-only, 위치 absolute)가 목록 밖 페이지 높이를 늘리지 않게 한다.
            없으면 목록이 차면 페이지 스크롤바가 생겨 지도 폭이 바뀌고, 다시 불러오는 동안 사라지기를 끝없이 되풀이한다(#199) */}
        <div
          className={cn(
            'relative flex-1 overflow-y-auto pb-4',
            // 내림 상태(폰)에서는 목록을 숨겨 손잡이만 남긴다. 끄는 동안에는 보여서 올라오는 목록이 보인다
            sheet === 'min' && !dragging && 'max-md:hidden',
          )}
        >
          {home.refreshError ? (
            <div
              role="alert"
              className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm"
            >
              <span>{home.refreshError}</span>
              <Button type="button" variant="outline" size="sm" onClick={home.retry}>
                다시 시도
              </Button>
            </div>
          ) : null}
          <SlotList
            items={home.items}
            serverNow={home.serverNow ?? serverNow}
            sort={sort}
            status={home.status}
            errorMessage={home.errorMessage}
            onRetry={home.retry}
            hasMore={home.hasMore}
            loadingMore={home.loadingMore}
            onLoadMore={home.loadMore}
            empty={
              <EmptyState
                title="이 지역에 지금 올라온 매물이 없어요"
                description="지도를 옮기거나 필터를 바꿔 보세요. 관심 동네를 정해 두면 새 매물이 올라올 때 알려 드려요."
                // 지도 영역은 동네 하나가 아니라서 바로 등록하지 않고 내 정보의 관심 동네로 보낸다(C-208)
                action={
                  <Link href="/me" className={buttonVariants({ size: 'sm' })}>
                    관심 동네 정하기
                  </Link>
                }
              />
            }
          />
        </div>
      </section>
    </main>
  );
}
