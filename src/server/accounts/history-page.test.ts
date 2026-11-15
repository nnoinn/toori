// 계정 이력 한 쪽 만들기(#374). 기록마다 따로 읽은 일을 최신 순으로 합쳐 쪽 번호에 맞게 자르고, 쪽 수를 센다.

import { describe, expect, it } from 'vitest';

import { clampHistoryPage, type HistoryList, toHistoryPage } from './history-page';
import type { AccountHistoryEvent, AccountHistoryKind } from './history-types';

function event(
  id: string,
  at: string,
  kind: AccountHistoryKind = 'reservation_created',
): AccountHistoryEvent {
  return {
    key: `${kind}:${id}`,
    at,
    kind,
    reservationId: null,
    reservationCode: null,
    menuName: null,
    startAt: null,
    amount: null,
    rate: null,
    hoursBeforeStart: null,
    reason: null,
    result: null,
  };
}

const list = (events: AccountHistoryEvent[], total = events.length): HistoryList => ({
  events,
  total,
});
const ids = (events: AccountHistoryEvent[]) => events.map((e) => e.key.split(':')[1]);

describe('계정 이력 한 쪽', () => {
  it('여러 기록의 일을 최신 순으로 합치고, 전체 수로 쪽 수를 센다', () => {
    const page = toHistoryPage(
      [
        list([event('a', '2026-11-12T03:00:00.000Z'), event('b', '2026-11-10T03:00:00.000Z')]),
        list([event('c', '2026-11-11T03:00:00.000Z')]),
      ],
      1,
      20,
    );
    expect(ids(page.events)).toEqual(['a', 'c', 'b']);
    expect(page).toMatchObject({ page: 1, pageCount: 1, total: 3 });
  });

  it('2쪽은 합친 순서의 다음 줄들이고, 쪽 수는 기록마다 센 전체 수를 더해 정한다', () => {
    // 기록마다 (2쪽 × 2줄) = 4개까지 읽어 온 것. 전체는 5 + 2 = 7개라 4쪽
    const page = toHistoryPage(
      [
        list(
          [
            event('a', '2026-11-12T05:00:00.000Z'),
            event('b', '2026-11-12T03:00:00.000Z'),
            event('d', '2026-11-10T03:00:00.000Z'),
            event('e', '2026-11-09T03:00:00.000Z'),
          ],
          5,
        ),
        list([event('c', '2026-11-11T03:00:00.000Z'), event('f', '2026-11-01T03:00:00.000Z')]),
      ],
      2,
      2,
    );
    expect(ids(page.events)).toEqual(['c', 'd']);
    expect(page).toMatchObject({ page: 2, pageCount: 4, total: 7 });
  });

  it('같은 시각이면 원래 기록 id 순, 그다음 일 이름 순이라 쪽을 넘겨도 겹치거나 빠지지 않는다', () => {
    const same = '2026-11-11T03:00:00.000Z';
    const lists = [
      list([event('id-3', same, 'slot_created'), event('id-1', same, 'slot_created')]),
      list([event('id-2', same, 'slot_closed'), event('id-1', same, 'slot_closed')]),
    ];
    const first = toHistoryPage(lists, 1, 2);
    const second = toHistoryPage(lists, 2, 2);
    expect(first.events.map((e) => e.key)).toEqual(['slot_closed:id-1', 'slot_created:id-1']);
    expect(second.events.map((e) => e.key)).toEqual(['slot_closed:id-2', 'slot_created:id-3']);
  });

  it('쪽 수보다 큰 쪽을 달라고 하면 마지막 쪽, 이력이 없으면 1쪽에 0건', () => {
    const lists = [
      list([event('a', '2026-11-12T03:00:00.000Z'), event('b', '2026-11-11T03:00:00.000Z')]),
    ];
    expect(toHistoryPage(lists, 9, 1)).toMatchObject({ page: 2, pageCount: 2, total: 2 });
    expect(ids(toHistoryPage(lists, 9, 1).events)).toEqual(['b']);
    expect(toHistoryPage([list([]), list([])], 1, 20)).toEqual({
      events: [],
      page: 1,
      pageCount: 1,
      total: 0,
    });
  });

  it('쪽 번호는 1~250으로 맞추고, 없거나 숫자가 아니면 1쪽', () => {
    expect(clampHistoryPage(undefined)).toBe(1);
    expect(clampHistoryPage(Number.NaN)).toBe(1);
    expect(clampHistoryPage(0)).toBe(1);
    expect(clampHistoryPage(3.7)).toBe(3);
    expect(clampHistoryPage(10_000)).toBe(250);
  });
});
