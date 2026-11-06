'use client';

// 홈 지도 마커와 목록을 서버에서 불러온다 (J4). 지도 영역·주소창 값(필터·정렬)·고른 샵이 바뀌면 다시 부른다.
// 늦게 도착한 예전 응답은 버린다(어떤 조건으로 부른 결과인지 key로 비교).
// 새 조건을 불러오는 동안에는 이전 핀과 목록을 그대로 두고, 새 결과가 오면 한 번에 바꾼다(#199, result-view.ts).

import { useCallback, useEffect, useRef, useState } from 'react';

import type { MapBounds, MapShop } from '../types';
import { loadHomeMap, loadHomeSlots } from './actions';
import { appendPage, type Failed, resultView, type Shown } from './result-view';
import type { SlotListItem } from './types';

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

  // 마지막으로 받은 결과와, 지금 조건으로 불러오지 못한 이유를 따로 둔다
  const [mapShown, setMapShown] = useState<Shown<MapShop[]> | null>(null);
  const [mapFailed, setMapFailed] = useState<Failed | null>(null);
  const [listShown, setListShown] = useState<Shown<ListData> | null>(null);
  const [listFailed, setListFailed] = useState<Failed | null>(null);
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
        if (result.ok) setMapShown({ key: mapKey, data: result.data.shops });
        else setMapFailed({ key: mapKey, message: result.error.message });
      })
      .catch(() => {
        if (current) setMapFailed({ key: mapKey, message: LOAD_FAILED });
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
        if (result.ok) setListShown({ key: listKey, data: result.data });
        else setListFailed({ key: listKey, message: result.error.message });
      })
      .catch(() => {
        if (current) setListFailed({ key: listKey, message: LOAD_FAILED });
      });
    return () => {
      current = false;
    };
  }, [listKey, bounds, search, shopId]);

  const map = resultView(mapKey, mapShown, mapFailed);
  const list = resultView(listKey, listShown, listFailed);
  // 이어 불러오기는 지금 조건의 목록일 때만(이전 영역의 목록 뒤에 새 영역 매물을 붙이지 않게)
  const nextCursor = list.current ? (list.data?.nextCursor ?? null) : null;

  const loadMore = useCallback(async () => {
    if (!bounds || !nextCursor || loadingMore) return;
    const requestKey = listKey;
    setLoadingMore(true);
    try {
      const result = await loadHomeSlots({ bounds, search, shopId, cursor: nextCursor });
      if (!result.ok || listKeyRef.current !== requestKey) return;
      setListShown((prev) => appendPage(prev, requestKey, result.data));
    } catch {
      // 이어 불러오기가 실패하면 지금 목록은 그대로 두고, 끝에 다시 닿으면 또 부른다
    } finally {
      setLoadingMore(false);
    }
  }, [bounds, search, shopId, listKey, nextCursor, loadingMore]);

  return {
    shops: map.data ?? NO_SHOPS,
    /** 지도 마커(매물 수)를 한 번이라도 받았는지. 받기 전에는 개수를 보여주지 않는다 */
    shopsReady: map.data !== null,
    items: list.data?.items ?? NO_ITEMS,
    serverNow: list.data?.serverNow ?? null,
    /** loading·error는 보여줄 목록이 아직 없을 때만(처음 불러오기). 그 뒤로는 이전 목록을 두고 ready */
    status: list.initialLoading
      ? ('loading' as const)
      : list.data === null
        ? ('error' as const)
        : ('ready' as const),
    errorMessage: list.data === null ? (list.error ?? undefined) : undefined,
    /** 이전 핀·목록을 보여주면서 새 영역·조건을 불러오는 중 */
    refreshing: map.refreshing || list.refreshing,
    /** 이전 목록은 두고 새 영역·조건을 불러오지 못했다(목록 위에 안내와 '다시 시도') */
    refreshError: list.data !== null ? (list.error ?? map.error) : null,
    hasMore: Boolean(nextCursor),
    loadingMore,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
