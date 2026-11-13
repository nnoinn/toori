// 시간대 매물 고객 조회 (C-201·C-301 시간대, #308 ②). 서버에서만 부른다(정찬형 목록·상세 쿼리처럼 DB와 시각을 받는다).
// - listSlotWindows: 범위 안 시간대 카드. 페이지로 나누지 않고 모두(상한 WINDOW_LIST_LIMIT) 준다. 섞기·정렬·세기는 목록 쿼리가 한다
// - getSlotWindow: 시간대 상세. 볼 수 없는 시간대(승인 안 된 샵, 그 샵 기존 고객에게 신규 고객 전용, 게시 전·마감·끝남,
//   시작할 수 있는 시각 없음)는 null(404)
//
// 진짜 버전이다: 원장님이 올린 시간대(slot_windows)와 서비스(slot_window_menus, 올릴 때 값)를 읽고, 그 샵의 예약됨·결제 중 매물을
// 빼고 시작 가능 시각을 계산한다(view.ts). 계산은 view.ts, DB 읽기는 store.ts에 있다

import 'server-only';

import { z } from 'zod';

import type { getDb } from '@/db';
import type { HomeFilters } from '@/features/map/filters';
import { shopImageUrl } from '@/features/map/slot-list/image-url';
import { WINDOW_LIST_LIMIT } from '@/server/policy';

import type { WindowArea } from './conditions';
import {
  type OpenWindow,
  readAreaWindows,
  readOccupiedRanges,
  readOccupiedRangesByShop,
  readOpenWindow,
  readWindowMenus,
  readWindowShopProfile,
} from './store';
import type { SlotWindowCard, SlotWindowDetail } from './types';
import { windowCardSummary, type WindowMenuView, windowMenuViews } from './view';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type SlotWindowListQuery = WindowArea & {
  filters: HomeFilters;
  /** 로그인한 고객 계정. 없으면 신규 고객 전용도 거르지 않는다(지금 매물 목록과 같다) */
  customerId: string | null;
  now: Date;
};

/**
 * 범위 안 시간대 카드. 필터는 서비스 중 하나라도 맞으면 보이고, 남은 시간에 들어가는 서비스가 없으면 뺀다. 가장 빠른 시작 순.
 * DB에서는 시간대 시작 순으로 WINDOW_LIST_LIMIT개까지 읽는다
 */
export async function listSlotWindows(
  db: DbReader,
  query: SlotWindowListQuery,
): Promise<SlotWindowCard[]> {
  const windows = await readAreaWindows(db, {
    area: query,
    category: query.filters.category,
    customerId: query.customerId,
    now: query.now,
    limit: WINDOW_LIST_LIMIT,
  });
  if (windows.length === 0) return [];
  const menusByWindow = await readWindowMenus(
    db,
    windows.map((window) => window.windowId),
  );
  const occupiedByShop = await readOccupiedRangesByShop(db, {
    shopIds: windows.map((window) => window.shopId),
    from: new Date(Math.min(...windows.map((window) => window.startAt.getTime()))),
    to: new Date(Math.max(...windows.map((window) => window.endAt.getTime()))),
    now: query.now,
  });

  const cards: SlotWindowCard[] = [];
  for (const window of windows) {
    const views = windowMenuViews({
      window: { start: window.startAt, end: window.endAt },
      menus: menusByWindow.get(window.windowId) ?? [],
      occupied: occupiedByShop.get(window.shopId) ?? [],
      now: query.now,
    });
    const summary = windowCardSummary(views, query.filters);
    if (!summary) continue;
    cards.push({
      windowId: window.windowId,
      shopId: window.shopId,
      shopName: window.name,
      category: window.category,
      lat: window.lat,
      lng: window.lng,
      imageUrl: shopImageUrl(window.imagePath),
      startAt: window.startAt.toISOString(),
      endAt: window.endAt.toISOString(),
      menuCount: summary.menuCount,
      firstMenuName: summary.firstMenuName,
      maxDiscountRate: summary.maxDiscountRate,
      minSalePrice: summary.minSalePrice,
      newCustomerOnly: window.newCustomerOnly,
      earliestStartAt: summary.earliestStart.toISOString(),
    });
  }
  return cards
    .sort((a, b) => a.earliestStartAt.localeCompare(b.earliestStartAt))
    .slice(0, WINDOW_LIST_LIMIT);
}

/**
 * 고객에게 보이는 시간대 하나와 서비스마다 지금 시작할 수 있는 시각. 볼 수 없으면 null.
 * 상세(getSlotWindow)와 [예약하기](holdWindowSlot)가 같이 쓴다
 */
export async function readWindowView(
  db: DbReader,
  query: { windowId: string; customerId: string | null; now: Date },
): Promise<{ window: OpenWindow; menus: WindowMenuView[] } | null> {
  if (!z.uuid().safeParse(query.windowId).success) return null;
  const window = await readOpenWindow(db, query);
  if (!window) return null;
  const menus = await readWindowMenus(db, [window.windowId]);
  const occupied = await readOccupiedRanges(db, {
    shopId: window.shopId,
    from: window.startAt,
    to: window.endAt,
    now: query.now,
  });
  return {
    window,
    menus: windowMenuViews({
      window: { start: window.startAt, end: window.endAt },
      menus: menus.get(window.windowId) ?? [],
      occupied,
      now: query.now,
    }),
  };
}

export type SlotWindowDetailQuery = {
  windowId: string;
  customerId: string | null;
  now: Date;
};

/** 시간대 상세. 서비스마다 지금 시작할 수 있는 시각(끝나는 시각 포함)을 준다 */
export async function getSlotWindow(
  db: DbReader,
  query: SlotWindowDetailQuery,
): Promise<SlotWindowDetail | null> {
  const view = await readWindowView(db, query);
  if (!view || view.menus.every((item) => item.startRanges.length === 0)) return null;
  const profile = await readWindowShopProfile(db, view.window.shopId);
  if (!profile) return null;
  return {
    windowId: view.window.windowId,
    shop: profile.shop,
    imageUrls: profile.imagePaths
      .map((path) => shopImageUrl(path))
      .filter((url): url is string => url !== null),
    startAt: view.window.startAt.toISOString(),
    endAt: view.window.endAt.toISOString(),
    newCustomerOnly: view.window.newCustomerOnly,
    menus: view.menus.map((item) => item.menu),
    serverNow: query.now.toISOString(),
  };
}
