'use client';

import { useState } from 'react';
import { cn } from 'cn';

import { EmptyState } from '@/components/ui/state';

import { KakaoMap } from './kakao-map';
import { SlotList } from './slot-list/slot-list';
import type { SlotSort } from './slot-list/sort';
import type { SlotListItem } from './slot-list/types';
import type { LatLng, MapBounds, MapShop } from './types';

type SheetSize = 'half' | 'full';

/** J4에서 매물 조회를 붙이기 전까지 비어 있다. 렌더마다 새 배열이 되지 않게 밖에 둔다 */
const NO_SHOPS: MapShop[] = [];
const NO_SLOTS: SlotListItem[] = [];

type HomeExplorerProps = {
  center: LatLng;
  myLocation: LatLng | null;
  /** 지도 위 왼쪽 위에 띄울 것(동네 바꾸기 버튼) */
  header: React.ReactNode;
  sort: SlotSort;
  /** 서버가 준 "지금"(ISO). 카드 남은 시간 기준 */
  serverNow: string;
};

/**
 * 홈 = 지도 + 아래 목록 시트 (J3, C-201, #17 Q2).
 * 시트는 반(지도·목록 반반, 기본) / 전체(목록만) 2단계이고, 매물 개수는 손잡이에 보여준다(D13).
 * 매물 조회는 J4에서 붙인다. 지금은 보이는 영역만 받아 두고 목록은 비어 있다.
 */
export function HomeExplorer({ center, myLocation, header, sort, serverNow }: HomeExplorerProps) {
  const [sheet, setSheet] = useState<SheetSize>('half');
  const [, setBounds] = useState<MapBounds | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const shops = NO_SHOPS;
  const slotCount = shops.reduce((sum, shop) => sum + shop.slotCount, 0);
  const selectedShop = shops.find((shop) => shop.shopId === selectedShopId) ?? null;

  return (
    <main className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      <div
        className={cn(
          'relative transition-[flex-basis] duration-200',
          sheet === 'half' ? 'flex-1' : 'h-0 flex-none overflow-hidden',
        )}
      >
        <KakaoMap
          className="absolute inset-0"
          center={center}
          myLocation={myLocation}
          shops={shops}
          onBoundsChange={setBounds}
          onSelectShop={(shopId) => {
            setSelectedShopId(shopId);
            setSheet('half');
          }}
          layoutKey={sheet}
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
        )}
      >
        <button
          type="button"
          className="flex flex-col items-center gap-1.5 pt-2 pb-3"
          aria-expanded={sheet === 'full'}
          onClick={() => setSheet(sheet === 'half' ? 'full' : 'half')}
        >
          <span className="h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
          <span className="text-sm font-semibold">
            {selectedShop ? `${selectedShop.name} · ` : ''}매물 {slotCount}개
          </span>
          <span className="sr-only">{sheet === 'half' ? '목록 크게 보기' : '지도 같이 보기'}</span>
        </button>
        <div className="flex-1 overflow-y-auto pb-4">
          <SlotList
            items={NO_SLOTS}
            serverNow={serverNow}
            sort={sort}
            empty={
              <EmptyState
                title="매물 목록은 준비 중이에요"
                description="곧 이 동네의 임박 할인 매물을 보여 드릴게요."
              />
            }
          />
        </div>
      </section>
    </main>
  );
}
