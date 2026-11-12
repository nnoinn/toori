// 시간대 매물 고객 조회 (C-201·C-301 시간대, #308). 서버에서만 부른다(정찬형 목록·상세 쿼리처럼 DB와 시각을 받는다).
// - listSlotWindows: 범위 안 시간대 카드. 페이지로 나누지 않고 모두(상한 WINDOW_LIST_LIMIT) 준다. 섞기·정렬·세기는 목록 쿼리가 한다
// - getSlotWindow: 시간대 상세. 볼 수 없는 시간대(승인 안 된 샵, 그 샵 기존 고객에게 신규 고객 전용, 게시 전·마감, 시작할 수 있는 시각 없음)는 null(404)
//
// 지금은 가짜 결과 버전이다(fake.ts). DEV_FAKE_SLOT_WINDOWS=on이면 범위 안 진짜 승인된 샵마다 가짜 시간대 하나(시간대 id = 샵 id)를 보여주고,
// 꺼져 있으면 시간대가 없다. 진짜 버전은 slot_windows를 읽고, 결과 모양은 그대로다

import 'server-only';

import { z } from 'zod';

import type { getDb } from '@/db';
import type { HomeFilters } from '@/features/map/filters';
import { shopImageUrl } from '@/features/map/slot-list/image-url';
import { WINDOW_LIST_LIMIT } from '@/server/policy';

import type { WindowArea } from './conditions';
import { buildFakeWindow, fakeWindowsOn } from './fake';
import { menusMatchingFilters } from './starts';
import { readAreaShops, readWindowShopProfile } from './store';
import type { SlotWindowCard, SlotWindowDetail } from './types';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type SlotWindowListQuery = WindowArea & {
  filters: HomeFilters;
  /** 로그인한 고객 계정. 없으면 신규 고객 전용도 거르지 않는다(지금 매물 목록과 같다) */
  customerId: string | null;
  now: Date;
};

/** 범위 안 시간대 카드. 필터는 서비스 중 하나라도 맞으면 보이고, 남은 시간에 들어가는 서비스가 없으면 뺀다. 가장 빠른 시작 순 */
export async function listSlotWindows(
  db: DbReader,
  query: SlotWindowListQuery,
): Promise<SlotWindowCard[]> {
  if (!fakeWindowsOn()) return [];
  const shops = await readAreaShops(db, {
    area: query,
    category: query.filters.category,
    limit: WINDOW_LIST_LIMIT,
  });
  const cards: SlotWindowCard[] = [];
  for (const shop of shops) {
    const window = await buildFakeWindow(db, shop.shopId, query.now);
    if (!window) continue;
    const open = window.menus.filter((item) => item.startRanges.length > 0);
    const matched = menusMatchingFilters(
      open.map((item) => ({ ...item.menu, starts: item.startRanges })),
      query.filters,
    );
    if (matched.length === 0) continue;
    const earliest = Math.min(...open.map((item) => item.startRanges[0].start.getTime()));
    cards.push({
      windowId: shop.shopId,
      shopId: shop.shopId,
      shopName: shop.name,
      category: shop.category,
      lat: shop.lat,
      lng: shop.lng,
      imageUrl: shopImageUrl(shop.imagePath),
      startAt: window.range.start.toISOString(),
      endAt: window.range.end.toISOString(),
      menuCount: open.length,
      firstMenuName: open[0].menu.name,
      maxDiscountRate: Math.max(...open.map((item) => item.menu.discountRate)),
      minSalePrice: Math.min(...open.map((item) => item.menu.salePrice)),
      newCustomerOnly: false,
      earliestStartAt: new Date(earliest).toISOString(),
    });
  }
  return cards
    .sort((a, b) => a.earliestStartAt.localeCompare(b.earliestStartAt))
    .slice(0, WINDOW_LIST_LIMIT);
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
  if (!fakeWindowsOn()) return null;
  if (!z.uuid().safeParse(query.windowId).success) return null;
  const profile = await readWindowShopProfile(db, query.windowId);
  if (!profile) return null;
  const window = await buildFakeWindow(db, query.windowId, query.now);
  if (!window || window.menus.every((item) => item.startRanges.length === 0)) return null;
  return {
    windowId: query.windowId,
    shop: profile.shop,
    imageUrls: profile.imagePaths
      .map((path) => shopImageUrl(path))
      .filter((url): url is string => url !== null),
    startAt: window.range.start.toISOString(),
    endAt: window.range.end.toISOString(),
    newCustomerOnly: false,
    menus: window.menus.map((item) => item.menu),
    serverNow: query.now.toISOString(),
  };
}
