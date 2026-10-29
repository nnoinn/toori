'use client';

import { useMemo } from 'react';

import { KakaoMap } from '@/features/map/kakao-map';
import type { MapShop } from '@/features/map/types';

type ShopLocationMapProps = {
  shopId: string;
  name: string;
  lat: number;
  lng: number;
};

/** 매물 상세의 작은 지도 (J7, C-302). 샵 위치를 가운데에 두고 핀 하나만 찍는다 */
export function ShopLocationMap({ shopId, name, lat, lng }: ShopLocationMapProps) {
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);
  // 렌더마다 새 배열이면 핀을 매번 다시 그린다
  const shops = useMemo<MapShop[]>(
    () => [{ shopId, name, lat, lng, slotCount: 1 }],
    [shopId, name, lat, lng],
  );
  return (
    <KakaoMap
      center={center}
      shops={shops}
      zoomable={false}
      className="h-48 w-full overflow-hidden rounded-xl border md:h-56"
    />
  );
}
