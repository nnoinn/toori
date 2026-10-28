'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { cn } from 'cn';

import { EmptyState } from '@/components/ui/state';

import { KakaoMap } from './kakao-map';
import { SlotList } from './slot-list/slot-list';
import type { SlotSort } from './slot-list/sort';
import { useHomeSlots } from './slot-list/use-home-slots';
import type { LatLng, MapBounds } from './types';
import { useIsDesktop } from './use-is-desktop';

type SheetSize = 'half' | 'full';

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
 * 폰: 아래 목록 시트. 반(지도·목록 반반, 기본) / 전체(목록만) 2단계이고, 매물 개수는 손잡이에 보여준다(D13).
 * PC(md 이상): 지도는 왼쪽 전체, 목록은 오른쪽 고정 패널(폭 400px). 시트 크기 바꾸기는 쓰지 않는다(10/25 결정).
 * 지도를 움직이면 보이는 영역 안의 매물을 다시 불러온다(D4). 마커를 누르면 그 샵 매물만 보고, 지도를 움직이면 다시 전체다.
 */
export function HomeExplorer({ center, myLocation, header, sort, serverNow }: HomeExplorerProps) {
  const [sheet, setSheet] = useState<SheetSize>('half');
  const isDesktop = useIsDesktop();
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const search = useSearchParams().toString();

  const home = useHomeSlots({ bounds, search, shopId: selectedShopId });
  const selectedShop = home.shops.find((shop) => shop.shopId === selectedShopId) ?? null;
  const slotCount = selectedShop
    ? selectedShop.slotCount
    : home.shops.reduce((sum, shop) => sum + shop.slotCount, 0);
  const title = `${selectedShop ? `${selectedShop.name} · ` : ''}${home.shopsReady ? `매물 ${slotCount}개` : '매물 불러오는 중'}`;

  return (
    <main className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden md:h-[calc(100dvh-4rem)] md:flex-row">
      <div
        className={cn(
          'relative transition-[flex-basis] duration-200',
          sheet === 'half' ? 'flex-1' : 'h-0 flex-none overflow-hidden',
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
            setBounds(next);
            setSelectedShopId(null);
          }}
          onSelectShop={(shopId) => {
            setSelectedShopId(shopId);
            setSheet('half');
          }}
          hidden={sheet === 'full' && !isDesktop}
        />
        <div className="absolute top-2 left-2 z-10 rounded-lg bg-background/90 shadow-sm">
          {header}
        </div>
      </div>

      <section
        aria-label="매물 목록"
        className={cn(
          'flex flex-col rounded-t-2xl border-t bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.06)]',
          sheet === 'half' ? 'h-1/2' : 'flex-1',
          'md:h-auto md:w-[400px] md:flex-none md:rounded-none md:border-t-0 md:border-l md:shadow-none',
        )}
      >
        <button
          type="button"
          className="flex flex-col items-center gap-1.5 pt-2 pb-3 md:hidden"
          aria-expanded={sheet === 'full'}
          onClick={() => setSheet(sheet === 'half' ? 'full' : 'half')}
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <span className="text-sm font-semibold">{title}</span>
          <span className="sr-only">{sheet === 'half' ? '목록 크게 보기' : '지도 같이 보기'}</span>
        </button>
        <div className="hidden items-center justify-between px-4 py-3 md:flex">
          <p className="font-semibold">{title}</p>
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
        <div className="flex-1 overflow-y-auto pb-4">
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
                description="지도를 옮기거나 필터를 바꿔 보세요."
              />
            }
          />
        </div>
      </section>
    </main>
  );
}
