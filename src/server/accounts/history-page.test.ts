// 계정 이력 한 쪽 만들기(#374). 기록마다 따로 읽은 일을 최신 순으로 합쳐 자르고, 다음 쪽 시각을 준다.

import { describe, expect, it } from 'vitest';

import {
  clampHistoryLimit,
  HISTORY_TIE_LIMIT,
  type HistoryRange,
  readHistoryPage,
  toHistoryPage,
} from './history-page';
import type { AccountHistoryEvent } from './history-types';

function event(key: string, at: string): AccountHistoryEvent {
  return {
    key,
    at,
    kind: 'reservation_created',
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

describe('계정 이력 한 쪽', () => {
  it('여러 기록의 일을 최신 순으로 합치고, limit보다 적으면 다음 쪽이 없다', () => {
    const page = toHistoryPage(
      [
        [event('a', '2026-11-12T03:00:00.000Z'), event('b', '2026-11-10T03:00:00.000Z')],
        [event('c', '2026-11-11T03:00:00.000Z')],
      ],
      30,
    );
    expect(page.events.map((e) => e.key)).toEqual(['a', 'c', 'b']);
    expect(page.nextBefore).toBeNull();
  });

  it('limit개로 자르고 마지막 일의 시각을 다음 쪽 기준(nextBefore)으로 준다', () => {
    const page = toHistoryPage(
      [
        [event('a', '2026-11-12T03:00:00.000Z'), event('b', '2026-11-11T03:00:00.000Z')],
        [event('c', '2026-11-10T03:00:00.000Z')],
      ],
      2,
    );
    expect(page.events.map((e) => e.key)).toEqual(['a', 'b']);
    expect(page.nextBefore).toBe('2026-11-11T03:00:00.000Z');
  });

  it('자르는 자리에 같은 시각의 일이 더 있으면 이번 쪽에 모두 넣는다(다음 쪽에서 빠지지 않게)', () => {
    const same = '2026-11-11T03:00:00.000Z';
    const page = toHistoryPage(
      [
        [event('a', '2026-11-12T03:00:00.000Z'), event('b', same)],
        [event('c', same), event('d', '2026-11-10T03:00:00.000Z')],
      ],
      2,
    );
    expect(page.events.map((e) => e.key)).toEqual(['a', 'b', 'c']);
    expect(page.nextBefore).toBe(same);
  });

  it('남은 일이 모두 같은 시각이어도 어느 기록이 limit + 1개를 채웠으면 DB에 더 있을 수 있어 다음 쪽을 준다', () => {
    const same = '2026-11-11T03:00:00.000Z';
    const page = toHistoryPage([[event('a', same), event('b', same), event('c', same)]], 2);
    expect(page.events).toHaveLength(3);
    expect(page.nextBefore).toBe(same);
  });

  it('한 기록이 limit + 1개를 채웠고 그 끝이 자르는 시각이면, 그 시각만 다시 읽어 빠짐없이 넣는다', async () => {
    // 매물 4개를 한 번에 만들어 등록 시각이 같다. 처음 읽기는 기록마다 limit + 1 = 3개라 d가 빠져 있다
    const same = '2026-11-11T03:00:00.000Z';
    const older = event('z', '2026-11-10T03:00:00.000Z');
    const ranges: HistoryRange[] = [];
    const page = await readHistoryPage(
      async (range) => {
        ranges.push(range);
        return range.from
          ? [[event('a', same), event('b', same), event('c', same), event('d', same)], []]
          : [[event('a', same), event('b', same), event('c', same)], [older]];
      },
      null,
      2,
    );
    expect(page.events.map((e) => e.key)).toEqual(['a', 'b', 'c', 'd']);
    expect(page.nextBefore).toBe(same);
    // 다시 읽는 범위는 그 1/1000초 안
    expect(ranges).toEqual([
      { before: null, from: null, limit: 2 },
      {
        before: new Date('2026-11-11T03:00:00.001Z'),
        from: new Date(same),
        limit: HISTORY_TIE_LIMIT,
      },
    ]);
  });

  it('limit + 1개를 채운 기록의 끝이 자르는 시각보다 앞서면 다시 읽지 않는다', async () => {
    const ranges: HistoryRange[] = [];
    const page = await readHistoryPage(
      async (range) => {
        ranges.push(range);
        return [
          [
            event('a', '2026-11-12T03:00:00.000Z'),
            event('b', '2026-11-11T03:00:00.000Z'),
            event('c', '2026-11-10T03:00:00.000Z'),
          ],
        ];
      },
      new Date('2026-11-13T00:00:00.000Z'),
      2,
    );
    expect(page.events.map((e) => e.key)).toEqual(['a', 'b']);
    expect(page.nextBefore).toBe('2026-11-11T03:00:00.000Z');
    expect(ranges).toEqual([
      { before: new Date('2026-11-13T00:00:00.000Z'), from: null, limit: 2 },
    ]);
  });

  it('줄 수는 1~100으로 맞추고, 없거나 숫자가 아니면 30', () => {
    expect(clampHistoryLimit(undefined)).toBe(30);
    expect(clampHistoryLimit(Number.NaN)).toBe(30);
    expect(clampHistoryLimit(0)).toBe(1);
    expect(clampHistoryLimit(500)).toBe(100);
    expect(clampHistoryLimit(12.7)).toBe(12);
  });
});
