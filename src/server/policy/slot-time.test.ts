import { describe, expect, it } from 'vitest';

import { addMinutes } from '@/lib/time';

import { getSlotTimeFlags } from './slot-time';

const now = new Date('2026-11-01T10:00:00+09:00');

describe('getSlotTimeFlags (C-203, C-308, #48 1장)', () => {
  it('딱 6시간 남았으면 임박·환불 불가가 아니다(기준 미만일 때만 true)', () => {
    expect(getSlotTimeFlags(addMinutes(now, 6 * 60), now)).toEqual({
      imminent: false,
      nonRefundable: false,
    });
  });

  it('5시간 59분 남았으면 임박·환불 불가다', () => {
    expect(getSlotTimeFlags(addMinutes(now, 6 * 60 - 1), now)).toEqual({
      imminent: true,
      nonRefundable: true,
    });
  });

  it('하루 남은 매물은 둘 다 아니다', () => {
    expect(getSlotTimeFlags(addMinutes(now, 24 * 60), now)).toEqual({
      imminent: false,
      nonRefundable: false,
    });
  });
});
