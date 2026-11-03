'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { cn } from 'cn';

import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/state';

import { categoryPinUrl, PIN_SIZE, PIN_TIP } from './category-pins';
import {
  kakaoMapSdkUrl,
  MAP_BOUNDS_DEBOUNCE_MS,
  MAP_INITIAL_LEVEL,
  MAP_OVERLAP_GRID_SIZE,
  MAP_REGION_GROUP_MIN_LEVEL,
} from './map-config';
import { groupShopsByRegion, type RegionGroup } from './region-groups';
import type { LatLng, MapBounds, MapShop } from './types';

const APP_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;

// 내 위치 점(파란 원). 샵 마커와 구분하려고 기본 마커 대신 쓴다
const MY_LOCATION_DOT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><circle cx="11" cy="11" r="8" fill="#3b82f6" stroke="white" stroke-width="3"/></svg>',
  );

/** 구 묶음 표시("단원구 12"). 누르면 그 구로 확대한다(#204) */
function regionGroupElement(group: RegionGroup, onClick: () => void): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    'flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm font-semibold shadow-md';
  button.setAttribute(
    'aria-label',
    `${group.name ?? '이 지역'} 매물 ${group.count}개. 누르면 확대해요`,
  );
  if (group.name) button.append(group.name);
  const count = document.createElement('span');
  count.className = 'rounded-full bg-primary px-2 text-xs text-primary-foreground';
  count.textContent = String(group.count);
  button.append(count);
  button.addEventListener('click', onClick);
  return button;
}

type KakaoMapProps = {
  /** 지도 가운데. 바뀌면 그 자리로 옮긴다 */
  center: LatLng;
  /** 내 위치를 쓰고 있으면 그 자리에 점을 찍는다 */
  myLocation?: LatLng | null;
  /**
   * 마커로 찍을 샵. 업종이 있으면 업종별 핀(#204). 멀리서 볼 때는 시·군·구마다 묶어 매물 수를 보여주고,
   * 가까이서는 거의 겹치는 핀만 숫자로 묶는다
   */
  shops?: MapShop[];
  /** 지도 이동·확대가 끝나면 보이는 영역을 알린다(잠깐 기다렸다가) */
  onBoundsChange?: (bounds: MapBounds) => void;
  onSelectShop?: (shopId: string) => void;
  /**
   * 목록 시트를 전체로 키워 지도가 가려졌는지. 가려진 동안에는 지도 크기를 다시 재지 않고
   * 보이는 영역도 알리지 않는다(높이 0으로 재면 영역이 0이 되어 목록이 비어 버린다).
   * 다시 보이면 크기를 재고 가운데를 지킨다.
   */
  hidden?: boolean;
  /** 마우스 휠·두 손가락으로 확대·축소. 페이지 안의 작은 지도는 끈다(휠로 페이지를 내리다 지도가 줄어들지 않게) */
  zoomable?: boolean;
  className?: string;
};

/** 카카오맵 (J3, X-503·C-201). SDK는 브라우저에서만 불러온다(D6) */
export function KakaoMap({
  center,
  myLocation,
  shops = [],
  onBoundsChange,
  onSelectShop,
  hidden = false,
  zoomable = true,
  className,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const clustererRef = useRef<kakao.maps.MarkerClusterer | null>(null);
  const myMarkerRef = useRef<kakao.maps.Marker | null>(null);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const [level, setLevel] = useState(MAP_INITIAL_LEVEL);
  const callbacksRef = useRef({ onBoundsChange, onSelectShop });
  const hiddenRef = useRef(hidden);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    APP_KEY ? 'loading' : 'error',
  );

  useEffect(() => {
    callbacksRef.current = { onBoundsChange, onSelectShop };
    hiddenRef.current = hidden;
  });

  // SDK가 준비되면 지도를 한 번 만든다
  useEffect(() => {
    if (status !== 'ready' || mapRef.current || !containerRef.current) return;
    const { maps } = window.kakao!;
    const map = new maps.Map(containerRef.current, {
      center: new maps.LatLng(center.lat, center.lng),
      level: MAP_INITIAL_LEVEL,
    });
    map.setZoomable(zoomable);
    mapRef.current = map;
    clustererRef.current = new maps.MarkerClusterer({
      map,
      averageCenter: true,
      minLevel: 1,
      gridSize: MAP_OVERLAP_GRID_SIZE,
    });
    // center·zoomable은 처음 만들 때만 쓴다. center가 바뀌면 아래 효과에서 옮긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // 지도 이동·확대가 끝나면 보이는 영역을 알린다. 개발 모드에서 효과가 두 번 돌아도 다시 붙도록 따로 둔다
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { maps } = window.kakao!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleIdle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (hiddenRef.current) return;
        const bounds = map.getBounds();
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        callbacksRef.current.onBoundsChange?.({
          sw: { lat: sw.getLat(), lng: sw.getLng() },
          ne: { lat: ne.getLat(), lng: ne.getLng() },
        });
      }, MAP_BOUNDS_DEBOUNCE_MS);
    };
    maps.event.addListener(map, 'idle', handleIdle);
    handleIdle();

    return () => {
      clearTimeout(timer);
      maps.event.removeListener(map, 'idle', handleIdle);
    };
  }, [status]);

  // 확대 정도가 바뀌면 핀과 구 묶음 중 무엇을 보여줄지 다시 고른다(#204)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { maps } = window.kakao!;
    const handleZoom = () => setLevel(map.getLevel());
    maps.event.addListener(map, 'zoom_changed', handleZoom);
    return () => maps.event.removeListener(map, 'zoom_changed', handleZoom);
  }, [status]);

  // 가운데가 바뀌면(동네 바꾸기, 내 위치로) 옮긴다
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setCenter(new window.kakao!.maps.LatLng(center.lat, center.lng));
  }, [status, center.lat, center.lng]);

  // 내 위치 점
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const { maps } = window.kakao!;
    myMarkerRef.current?.setMap(null);
    myMarkerRef.current = myLocation
      ? new maps.Marker({
          map,
          position: new maps.LatLng(myLocation.lat, myLocation.lng),
          title: '내 위치',
          zIndex: 10,
          image: new maps.MarkerImage(MY_LOCATION_DOT, new maps.Size(22, 22), {
            offset: new maps.Point(11, 11),
          }),
        })
      : null;
  }, [status, myLocation?.lat, myLocation?.lng, myLocation]);

  // 샵 마커와 묶기. 멀리서 볼 때는 핀 대신 구 묶음(#204)
  useEffect(() => {
    const map = mapRef.current;
    const clusterer = clustererRef.current;
    if (!map || !clusterer) return;
    const { maps } = window.kakao!;
    clusterer.clear();
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    if (level >= MAP_REGION_GROUP_MIN_LEVEL) {
      overlaysRef.current = groupShopsByRegion(shops).map((group) => {
        const position = new maps.LatLng(group.center.lat, group.center.lng);
        return new maps.CustomOverlay({
          position,
          map,
          clickable: true,
          content: regionGroupElement(group, () => {
            map.setLevel(MAP_INITIAL_LEVEL, { anchor: position });
            map.setCenter(position);
          }),
        });
      });
      return;
    }

    // 업종별 핀 그림. 색은 테마 색 이름(--primary)을 읽어 넣는다. 못 읽으면 카카오 기본 핀
    const color = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    const images = new Map<string, kakao.maps.MarkerImage>();
    const pinImage = (category: MapShop['category']) => {
      if (!category || !color) return undefined;
      let image = images.get(category);
      if (!image) {
        image = new maps.MarkerImage(
          categoryPinUrl(category, color),
          new maps.Size(PIN_SIZE.width, PIN_SIZE.height),
          { offset: new maps.Point(PIN_TIP.x, PIN_TIP.y) },
        );
        images.set(category, image);
      }
      return image;
    };
    const markers = shops.map((shop) => {
      const marker = new maps.Marker({
        position: new maps.LatLng(shop.lat, shop.lng),
        title: shop.name,
        clickable: true,
        image: pinImage(shop.category),
      });
      maps.event.addListener(marker, 'click', () => {
        callbacksRef.current.onSelectShop?.(shop.shopId);
      });
      return marker;
    });
    clusterer.addMarkers(markers);
  }, [status, shops, level]);

  // 지도가 다시 보이면(목록 시트를 반으로 줄임) 크기를 다시 재고 가운데를 지킨다. 가려질 때는 재지 않는다
  useEffect(() => {
    const map = mapRef.current;
    if (!map || hidden) return;
    const keep = map.getCenter();
    map.relayout();
    map.setCenter(keep);
  }, [hidden]);

  // 지도 칸 크기가 바뀌면(창 크기 바꾸기, 폰 돌리기, PC↔폰 배치 바뀜) 크기를 다시 재고 가운데를 지킨다.
  // 카카오 지도는 칸 크기가 바뀐 것을 스스로 알지 못한다. 가려진 동안(높이 0)은 재지 않는다
  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!map || !container) return;
    const observer = new ResizeObserver(() => {
      if (hiddenRef.current || container.clientHeight === 0) return;
      const keep = map.getCenter();
      map.relayout();
      map.setCenter(keep);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [status]);

  return (
    <div className={cn('relative', className)}>
      {APP_KEY ? (
        <Script
          src={kakaoMapSdkUrl(APP_KEY)}
          onReady={() => window.kakao?.maps.load(() => setStatus('ready'))}
          onError={() => setStatus('error')}
        />
      ) : null}
      <div ref={containerRef} className="absolute inset-0" aria-label="매물 지도" role="region" />
      {status === 'loading' ? <Skeleton className="absolute inset-0 rounded-none" /> : null}
      {status === 'error' ? (
        <ErrorState
          className="absolute inset-0 justify-center bg-muted"
          title="지도를 불러오지 못했어요"
          description="잠시 후 다시 열어 주세요. 아래 목록은 그대로 볼 수 있어요."
        />
      ) : null}
    </div>
  );
}
