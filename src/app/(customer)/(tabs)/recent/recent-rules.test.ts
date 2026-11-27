import { describe, expect, it } from 'vitest';

import {
  addRecentEntry,
  inViewedOrder,
  parseRecentEntries,
  RECENT_SLOT_LIMIT,
  type RecentEntry,
  recentIds,
  recentItemHref,
  recentItemTexts,
  showsRecentButton,
} from './recent-rules';
import type { RecentItem } from './types';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const slot = (n: number): RecentEntry => ({ kind: 'slot', id: id(n) });
const win = (n: number): RecentEntry => ({ kind: 'window', id: id(n) });

const item = (entry: RecentEntry, patch: Partial<RecentItem> = {}): RecentItem => ({
  ...entry,
  shopName: '샘플 헤어 중앙역점',
  menuName: '여성 커트',
  menuCount: 1,
  // 2026-11-28(토) 11:00 한국 시간
  startAt: '2026-11-28T02:00:00.000Z',
  endAt: null,
  discountRate: 30,
  salePrice: 14000,
  closed: false,
  ...patch,
});

describe('최근 본 매물 기록 (C-212, 이 기기에만)', () => {
  it('본 매물을 맨 앞에, 이미 있으면 맨 앞으로 옮긴다(같은 id라도 종류가 다르면 따로)', () => {
    expect(addRecentEntry([slot(1), slot(2)], slot(3))).toEqual([slot(3), slot(1), slot(2)]);
    expect(addRecentEntry([slot(1), slot(2)], slot(2))).toEqual([slot(2), slot(1)]);
    expect(addRecentEntry([slot(1)], win(1))).toEqual([win(1), slot(1)]);
  });

  it(`${RECENT_SLOT_LIMIT}개를 넘으면 오래된 것부터 뺀다`, () => {
    const full = Array.from({ length: RECENT_SLOT_LIMIT }, (_, i) => slot(i + 1));
    const next = addRecentEntry(full, slot(99));
    expect(next).toHaveLength(RECENT_SLOT_LIMIT);
    expect(next[0]).toEqual(slot(99));
    expect(next).not.toContainEqual(slot(RECENT_SLOT_LIMIT));
  });

  it('저장해 둔 값: 모양이 틀린 줄은 버리고 겹치지 않게 상한까지', () => {
    expect(parseRecentEntries(null)).toEqual([]);
    expect(parseRecentEntries('깨진 값')).toEqual([]);
    expect(
      parseRecentEntries(
        JSON.stringify([
          slot(1),
          { kind: 'slot', id: 'not-uuid' },
          { kind: 'shop', id: id(2) },
          slot(1),
          win(3),
        ]),
      ),
    ).toEqual([slot(1), win(3)]);
    const many = Array.from({ length: RECENT_SLOT_LIMIT + 5 }, (_, i) => slot(i + 1));
    expect(parseRecentEntries(JSON.stringify(many))).toHaveLength(RECENT_SLOT_LIMIT);
  });

  it('서버에 물어볼 id는 종류별로', () => {
    expect(recentIds([slot(1), win(2), slot(3)])).toEqual({
      slotIds: [id(1), id(3)],
      windowIds: [id(2)],
    });
  });

  it('서버가 준 매물을 본 순서로 놓고, 서버가 뺀 매물(시작 지남·볼 수 없음)은 빠진다', () => {
    const list = [slot(1), win(2), slot(3)];
    const fromServer = [item(slot(3)), item(win(2))];
    expect(inViewedOrder(list, fromServer).map((row) => row.id)).toEqual([id(2), id(3)]);
  });
});

describe('최근 본 매물 버튼을 두는 화면', () => {
  it('홈·매물 목록·관심 샵·내 예약·내 정보에는 두고, 매물·시간대 상세와 지도에는 두지 않는다', () => {
    for (const path of ['/home', '/home/list', '/home/favorites', '/reservations', '/me']) {
      expect(showsRecentButton(path)).toBe(true);
    }
    for (const path of [`/slots/${id(1)}`, `/windows/${id(1)}`, '/home/map']) {
      expect(showsRecentButton(path)).toBe(false);
    }
  });
});

describe('최근 본 매물 한 줄 글자', () => {
  it('한 시술 매물: 시술 이름, 시작 시각(한국 시간), 할인율과 판매가', () => {
    expect(recentItemTexts(item(slot(1)))).toEqual({
      title: '여성 커트',
      time: '11/28(토) 11:00',
      price: '30% 14,000원',
    });
    expect(recentItemHref(slot(1))).toBe(`/slots/${id(1)}`);
  });

  it('시간대 매물: "첫 서비스 외 N개", 시간대 범위, 최대 할인율과 최저가', () => {
    const texts = recentItemTexts(
      item(win(2), {
        menuCount: 3,
        endAt: '2026-11-28T08:00:00.000Z',
        discountRate: 40,
        salePrice: 12000,
      }),
    );
    expect(texts.title).toBe('여성 커트 외 2개');
    expect(texts.time).toBe('11/28(토) 11:00 ~ 17:00');
    expect(texts.price).toBe('최대 40% · 12,000원부터');
    expect(recentItemHref(win(2))).toBe(`/windows/${id(2)}`);
  });
});
