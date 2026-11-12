import { describe, expect, it } from 'vitest';

import type { SlotWindowMenu } from '@/server/slot-windows';

import {
  firstOpenMenuId,
  reserveHint,
  resolvePick,
  startEndText,
  windowRangeText,
} from './window-texts';

// 시각은 UTC로 적는다. 한국 시간은 +9시간(2026-11-14 토요일)
const kst = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 10, day, hour - 9, minute)).toISOString();

function menu(menuId: string, starts: { startAt: string; endAt: string }[]): SlotWindowMenu {
  return {
    menuId,
    serviceType: 'cut',
    name: `서비스 ${menuId}`,
    description: null,
    durationMinutes: 60,
    listPrice: 20000,
    discountRate: 30,
    salePrice: 14000,
    starts,
  };
}

describe('시간대 범위', () => {
  it('같은 날이면 날짜 한 번과 시작·끝 시각', () => {
    expect(windowRangeText(kst(14, 14), kst(14, 18))).toBe('11/14(토) 14:00 ~ 18:00');
  });

  it('새벽까지 이어지면 끝에 "다음 날"을 붙인다', () => {
    expect(windowRangeText(kst(14, 22), kst(15, 2))).toBe('11/14(토) 22:00 ~ 다음 날 02:00');
  });

  it('자정에 끝나면 24:00', () => {
    expect(windowRangeText(kst(14, 18), kst(15, 0))).toBe('11/14(토) 18:00 ~ 24:00');
  });

  it('시작 시각 버튼의 끝 시각도 같은 규칙', () => {
    expect(startEndText({ startAt: kst(14, 14), endAt: kst(14, 15, 30) })).toBe('~ 15:30');
    expect(startEndText({ startAt: kst(14, 23), endAt: kst(15, 0) })).toBe('~ 24:00');
    expect(startEndText({ startAt: kst(14, 23, 30), endAt: kst(15, 0, 30) })).toBe(
      '~ 다음 날 00:30',
    );
  });
});

describe('서비스·시작 시각 고르기', () => {
  const a = menu('a', []);
  const b = menu('b', [
    { startAt: kst(14, 14), endAt: kst(14, 15) },
    { startAt: kst(14, 14, 30), endAt: kst(14, 15, 30) },
  ]);

  it('처음에는 시작할 수 있는 시각이 있는 첫 서비스를 골라 둔다', () => {
    expect(firstOpenMenuId([a, b])).toBe('b');
    expect(firstOpenMenuId([a])).toBeNull();
  });

  it('고른 시각이 다시 불러온 목록에 없으면 시각만 비운다', () => {
    expect(resolvePick([a, b], { menuId: 'b', startAt: kst(14, 14, 30) }).start?.startAt).toBe(
      kst(14, 14, 30),
    );
    const gone = resolvePick([a, menu('b', [])], { menuId: 'b', startAt: kst(14, 14, 30) });
    expect(gone.menu?.menuId).toBe('b');
    expect(gone.start).toBeNull();
    expect(resolvePick([a], { menuId: 'b', startAt: null })).toEqual({ menu: null, start: null });
  });

  it('다 고르기 전에는 무엇을 고를지 알려 주고, 다 골랐으면 null', () => {
    expect(reserveHint(null, null)).toBe('서비스를 골라 주세요');
    expect(reserveHint(a, null)).toBe('이 서비스는 지금 고를 수 있는 시각이 없어요');
    expect(reserveHint(b, null)).toBe('시작 시각을 골라 주세요');
    expect(reserveHint(b, b.starts[0])).toBeNull();
  });
});
