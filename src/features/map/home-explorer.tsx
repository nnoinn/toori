'use client';

import { useState } from 'react';
import { cn } from 'cn';

import { EmptyState } from '@/components/ui/state';

import { KakaoMap } from './kakao-map';
import type { LatLng, MapBounds, MapShop } from './types';
import { useIsDesktop } from './use-is-desktop';

type SheetSize = 'half' | 'full';

/** J4에서 매물 조회를 붙이기 전까지 비어 있다. 렌더마다 새 배열이 되지 않게 밖에 둔다 */
const NO_SHOPS: MapShop[] = [];

type HomeExplorerProps = {
  center: LatLng;
  myLocation: LatLng | null;
  /** 지도 위 왼쪽 위에 띄울 것(동네 바꾸기 버튼) */
  header: React.ReactNode;
};

/**
 * 홈 = 지도 + 목록 (J3, C-201, #17 Q2).
 * 폰: 아래 목록 시트. 반(지도·목록 반반, 기본) / 전체(목록만) 2단계이고, 매물 개수는 손잡이에 보여준다(D13).
 * PC(md 이상): 지도는 왼쪽 전체, 목록은 오른쪽 고정 패널(폭 400px). 시트 크기 바꾸기는 쓰지 않는다(10/25 결정).
 * 매물 조회는 J4에서 붙인다. 지금은 보이는 영역만 받아 두고 목록은 비어 있다.
 */
export function HomeExplorer({ center, myLocation, header }: HomeExplorerProps) {
  const [sheet, setSheet] = useState<SheetSize>('half');
  const isDesktop = useIsDesktop();
  const [, setBounds] = useState<MapBounds | null>(null);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);
  const shops = NO_SHOPS;
  const slotCount = shops.reduce((sum, shop) => sum + shop.slotCount, 0);
  const selectedShop = shops.find((shop) => shop.shopId === selectedShopId) ?? null;

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
          shops={shops}
          onBoundsChange={setBounds}
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
          <span className="text-sm font-semibold">
            {selectedShop ? `${selectedShop.name} · ` : ''}매물 {slotCount}개
          </span>
          <span className="sr-only">{sheet === 'half' ? '목록 크게 보기' : '지도 같이 보기'}</span>
        </button>
        <p className="hidden px-4 py-3 font-semibold md:block">
          {selectedShop ? `${selectedShop.name} · ` : ''}매물 {slotCount}개
        </p>
        <div className="flex-1 overflow-y-auto">
          <EmptyState
            title="매물 목록은 준비 중이에요"
            description="곧 이 동네의 임박 할인 매물을 보여 드릴게요."
          />
        </div>
      </section>
    </main>
  );
}
