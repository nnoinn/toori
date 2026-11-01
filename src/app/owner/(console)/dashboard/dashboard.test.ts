import { describe, expect, it } from 'vitest';

import {
  countByStatus,
  type DashboardSlot,
  onHold,
  splitByDay,
  startOfKstDay,
  viewStatus,
} from './dashboard';

// 한국 시간 10/31 낮 12시
const now = new Date('2026-10-31T12:00:00+09:00');
const kst = (iso: string) => new Date(`${iso}+09:00`).toISOString();

const slot = (start: string, extra: Partial<DashboardSlot> = {}): DashboardSlot => ({
  id: start,
  status: 'published',
  startAt: kst(start),
  endAt: kst(start),
  publishAt: kst('2026-10-30T00:00:00'),
  menuName: '커트',
  listPrice: 20000,
  salePrice: 14000,
  discountRate: 30,
  newCustomerOnly: false,
  holdCustomerId: null,
  holdExpiresAt: null,
  reservationCode: null,
  ...extra,
});

describe('대시보드 날짜 나누기 (S-401)', () => {
  it('오늘 0시는 한국 날짜 기준', () => {
    expect(startOfKstDay(now).toISOString()).toBe(kst('2026-10-31T00:00:00'));
    // UTC로는 아직 10/30 15시지만 한국은 10/31 0시
    expect(startOfKstDay(new Date('2026-10-30T15:00:00Z')).toISOString()).toBe(
      kst('2026-10-31T00:00:00'),
    );
  });

  it('오늘 0시~자정 전은 오늘, 그 뒤는 예정, 오늘 0시 전은 뺀다', () => {
    const result = splitByDay(
      [
        slot('2026-10-30T23:30:00'),
        slot('2026-10-31T00:00:00'),
        slot('2026-10-31T23:30:00'),
        slot('2026-11-01T00:00:00'),
        slot('2026-11-02T10:00:00'),
      ],
      now,
    );
    expect(result.today.map((s) => s.id)).toEqual(['2026-10-31T00:00:00', '2026-10-31T23:30:00']);
    expect(result.upcoming.map((s) => s.id)).toEqual([
      '2026-11-01T00:00:00',
      '2026-11-02T10:00:00',
    ]);
  });
});

describe('대시보드 상태 (O1 getSlotStatus)', () => {
  it('시작이 지난 게시중은 마감, 게시 시각 전 예약대기는 예약대기', () => {
    expect(viewStatus(slot('2026-10-31T09:00:00'), now)).toBe('closed');
    expect(
      viewStatus(
        slot('2026-11-02T09:00:00', { status: 'scheduled', publishAt: kst('2026-10-31T09:00:01') }),
        now,
      ),
    ).toBe('published');
    expect(
      viewStatus(
        slot('2026-11-02T13:00:00', { status: 'scheduled', publishAt: kst('2026-10-31T13:00:00') }),
        now,
      ),
    ).toBe('scheduled');
  });

  it('상태별 개수를 화면 상태로 센다', () => {
    const counts = countByStatus(
      [
        slot('2026-10-31T09:00:00'),
        slot('2026-10-31T15:00:00'),
        slot('2026-10-31T16:00:00', { status: 'reserved' }),
        slot('2026-10-31T17:00:00', { status: 'cancelled' }),
      ],
      now,
    );
    expect(counts).toEqual({
      scheduled: 0,
      published: 1,
      reserved: 1,
      closed: 1,
      cancelled: 1,
      completed: 0,
    });
  });

  it('홀딩은 만료 전에만', () => {
    const held = slot('2026-10-31T15:00:00', {
      holdCustomerId: 'c1',
      holdExpiresAt: kst('2026-10-31T12:05:00'),
    });
    expect(onHold(held, now)).toBe(true);
    expect(onHold({ ...held, holdExpiresAt: kst('2026-10-31T11:59:00') }, now)).toBe(false);
  });
});
