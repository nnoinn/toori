'use client';

// 홈 지도 마커와 목록을 서버에서 불러온다 (J4). 지도 영역·주소창 값(필터·정렬)·고른 샵이 바뀌면 다시 부른다.
// 늦게 도착한 예전 응답은 버린다(어떤 조건으로 부른 결과인지 key로 비교). 로딩 중인지도 key로 판단한다.

import { useCallback, useEffect, useRef, useState } from 'react';

import type { MapBounds, MapShop } from '../types';
import { loadHomeMap, loadHomeSlots } from './actions';
import type { SlotListItem } from './types';

type Loaded<T> = { key: string } & ({ ok: true; data: T } | { ok: false; message: string });

type ListData = { items: SlotListItem[]; nextCursor: string | null; serverNow: string };

const LOAD_FAILED = '매물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요';

const NO_SHOPS: MapShop[] = [];
const NO_ITEMS: SlotListItem[] = [];

export function useHomeSlots({
  bounds,
  search,
  shopId,
}: {
  /** 지도가 아직 준비되지 않았으면 null */
  bounds: MapBounds | null;
  search: string;
  shopId: string | null;
}) {
  const [attempt, setAttempt] = useState(0);
  const mapKey = bounds ? JSON.stringify({ bounds, search, attempt }) : null;
  const listKey = bounds ? JSON.stringify({ bounds, search, shopId, attempt }) : null;

  const [map, setMap] = useState<Loaded<MapShop[]> | null>(null);
  const [list, setList] = useState<Loaded<ListData> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // 이어 불러오기가 지금 목록에 대한 것인지 확인한다
  const listKeyRef = useRef(listKey);
  useEffect(() => {
    listKeyRef.current = listKey;
  });

  useEffect(() => {
    if (!mapKey || !bounds) return;
    let current = true;
    loadHomeMap({ bounds, search })
      .then((result) => {
        if (!current) return;
        setMap(
          result.ok
            ? { key: mapKey, ok: true, data: result.data.shops }
            : { key: mapKey, ok: false, message: result.error.message },
        );
      })
      .catch(() => {
        if (current) setMap({ key: mapKey, ok: false, message: LOAD_FAILED });
      });
    return () => {
      current = false;
    };
  }, [mapKey, bounds, search]);

  useEffect(() => {
    if (!listKey || !bounds) return;
    let current = true;
    loadHomeSlots({ bounds, search, shopId, cursor: null })
      .then((result) => {
        if (!current) return;
        setList(
          result.ok
            ? { key: listKey, ok: true, data: result.data }
            : { key: listKey, ok: false, message: result.error.message },
        );
      })
      .catch(() => {
        if (current) setList({ key: listKey, ok: false, message: LOAD_FAILED });
      });
    return () => {
      current = false;
    };
  }, [listKey, bounds, search, shopId]);

  const listReady = list !== null && list.key === listKey;
  const listData = listReady && list.ok ? list.data : null;

  const loadMore = useCallback(async () => {
    if (!bounds || !listData?.nextCursor || loadingMore) return;
    const requestKey = listKey;
    setLoadingMore(true);
    try {
      const result = await loadHomeSlots({ bounds, search, shopId, cursor: listData.nextCursor });
      if (!result.ok || listKeyRef.current !== requestKey) return;
      setList((prev) =>
        prev && prev.ok && prev.key === requestKey
          ? {
              ...prev,
              data: {
                items: [...prev.data.items, ...result.data.items],
                nextCursor: result.data.nextCursor,
                serverNow: result.data.serverNow,
              },
            }
          : prev,
      );
    } catch {
      // 이어 불러오기가 실패하면 지금 목록은 그대로 두고, 끝에 다시 닿으면 또 부른다
    } finally {
      setLoadingMore(false);
    }
  }, [bounds, search, shopId, listKey, listData, loadingMore]);

  const mapReady = map !== null && map.key === mapKey;

  return {
    shops: mapReady && map.ok ? map.data : NO_SHOPS,
    /** 지도 마커(매물 수)를 받았는지. 받기 전에는 개수를 보여주지 않는다 */
    shopsReady: mapReady && map.ok,
    items: listData?.items ?? NO_ITEMS,
    serverNow: listData?.serverNow ?? null,
    status: !listReady ? ('loading' as const) : list.ok ? ('ready' as const) : ('error' as const),
    errorMessage: listReady && !list.ok ? list.message : undefined,
    hasMore: Boolean(listData?.nextCursor),
    loadingMore,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
