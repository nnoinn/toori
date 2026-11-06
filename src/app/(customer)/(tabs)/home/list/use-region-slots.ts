'use client';

// 지도 없는 매물 목록을 서버에서 불러온다 (#215). 범위(시·군·구)는 서버가 위치 쿠키로 정하고, 화면은 필터·정렬만 넘긴다.
// 필터·정렬·동네가 바뀌면 다시 부르고, 그동안 이전 목록을 그대로 둔다(지도 홈과 같은 방식, result-view.ts).

import { useCallback, useEffect, useRef, useState } from 'react';

import { loadRegionSlots } from '@/features/map/slot-list/actions';
import {
  appendPage,
  type Failed,
  resultView,
  type Shown,
} from '@/features/map/slot-list/result-view';
import type { SlotListItem } from '@/features/map/slot-list/types';

type ListData = {
  items: SlotListItem[];
  nextCursor: string | null;
  serverNow: string;
  total: number | null;
};

const LOAD_FAILED = '매물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요';
const NO_ITEMS: SlotListItem[] = [];

export function useRegionSlots({ areaCode, search }: { areaCode: string; search: string }) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify({ areaCode, search, attempt });
  const [shown, setShown] = useState<Shown<ListData> | null>(null);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // 이어 불러오기가 지금 목록에 대한 것인지 확인한다
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  });

  useEffect(() => {
    let current = true;
    loadRegionSlots({ search, cursor: null })
      .then((result) => {
        if (!current) return;
        if (result.ok) setShown({ key, data: result.data });
        else setFailed({ key, message: result.error.message });
      })
      .catch(() => {
        if (current) setFailed({ key, message: LOAD_FAILED });
      });
    return () => {
      current = false;
    };
  }, [key, search]);

  const view = resultView(key, shown, failed);
  const nextCursor = view.current ? (view.data?.nextCursor ?? null) : null;

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const requestKey = key;
    setLoadingMore(true);
    try {
      const result = await loadRegionSlots({ search, cursor: nextCursor });
      if (!result.ok || keyRef.current !== requestKey) return;
      setShown((prev) => appendPage(prev, requestKey, result.data));
    } catch {
      // 이어 불러오기가 실패하면 지금 목록은 그대로 두고, 끝에 다시 닿으면 또 부른다
    } finally {
      setLoadingMore(false);
    }
  }, [key, search, nextCursor, loadingMore]);

  return {
    items: view.data?.items ?? NO_ITEMS,
    serverNow: view.data?.serverNow ?? null,
    /** 범위 안 매물 수. 처음 불러오기 전이면 null */
    total: view.data?.total ?? null,
    status: view.initialLoading
      ? ('loading' as const)
      : view.data === null
        ? ('error' as const)
        : ('ready' as const),
    errorMessage: view.data === null ? (view.error ?? undefined) : undefined,
    refreshing: view.refreshing,
    refreshError: view.data !== null ? view.error : null,
    hasMore: Boolean(nextCursor),
    loadingMore,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}
