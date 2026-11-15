import { describe, expect, it } from 'vitest';

import { isHeldByMe, isHeldByOther, slotBadges, type SlotBadgeInput, windowBadges } from './badges';

const NOW = new Date('2026-11-01T06:00:00+09:00');
const ME = '11111111-1111-4111-8111-111111111111';
const SOMEONE = '22222222-2222-4222-8222-222222222222';

function slot(extra: Partial<SlotBadgeInput> = {}): SlotBadgeInput {
  return {
    startAt: new Date('2026-11-01T18:00:00+09:00'),
    newCustomerOnly: false,
    holdCustomerId: null,
    holdExpiresAt: null,
    ...extra,
  };
}

const heldBy = (customerId: string, minutesLeft = 5) => ({
  holdCustomerId: customerId,
  holdExpiresAt: new Date(NOW.getTime() + minutesLeft * 60_000),
});

describe('매물 배지', () => {
  it('6시간 미만이면 환불 불가·임박, 딱 6시간이면 없음', () => {
    expect(slotBadges(slot({ startAt: new Date('2026-11-01T11:59:00+09:00') }), null, NOW)).toEqual(
      ['nonRefundable', 'imminent'],
    );
    expect(slotBadges(slot({ startAt: new Date('2026-11-01T12:00:00+09:00') }), null, NOW)).toEqual(
      [],
    );
  });

  it('신규 고객 전용 배지', () => {
    expect(slotBadges(slot({ newCustomerOnly: true }), null, NOW)).toEqual(['newCustomerOnly']);
  });

  it('다른 고객이 홀딩 중이면 결제 중 배지, 내 홀딩이나 끝난 홀딩은 없음', () => {
    expect(slotBadges(slot(heldBy(SOMEONE)), ME, NOW)).toEqual(['onHold']);
    expect(slotBadges(slot(heldBy(SOMEONE)), null, NOW)).toEqual(['onHold']);
    expect(slotBadges(slot(heldBy(ME)), ME, NOW)).toEqual([]);
    expect(slotBadges(slot(heldBy(SOMEONE, -1)), ME, NOW)).toEqual([]);
  });

  it('내 홀딩 / 남의 홀딩 구분', () => {
    expect(isHeldByMe(slot(heldBy(ME)), ME, NOW)).toBe(true);
    expect(isHeldByMe(slot(heldBy(ME)), null, NOW)).toBe(false);
    expect(isHeldByOther(slot(heldBy(ME)), ME, NOW)).toBe(false);
    expect(isHeldByOther(slot(heldBy(ME)), SOMEONE, NOW)).toBe(true);
    expect(isHeldByMe(slot(), ME, NOW)).toBe(false);
    // 10분이 지난 내 홀딩, 다른 고객의 홀딩은 '결제 이어서 하기'가 아니다(C-404)
    expect(isHeldByMe(slot(heldBy(ME, -1)), ME, NOW)).toBe(false);
    expect(isHeldByMe(slot(heldBy(SOMEONE)), ME, NOW)).toBe(false);
  });
});

// 시간대 카드(#308): 임박은 가장 빠른 시작 기준(C-203, 6시간). 환불 불가는 고르는 시각마다 달라 카드에 붙이지 않는다
describe('시간대 카드 배지', () => {
  const at = (iso: string) => new Date(iso);

  it('가장 빠른 시작이 6시간 미만이면 임박만, 딱 6시간이면 없음', () => {
    expect(
      windowBadges(
        { earliestStartAt: at('2026-11-01T11:59:00+09:00'), newCustomerOnly: false },
        NOW,
      ),
    ).toEqual(['imminent']);
    expect(
      windowBadges(
        { earliestStartAt: at('2026-11-01T12:00:00+09:00'), newCustomerOnly: false },
        NOW,
      ),
    ).toEqual([]);
  });

  it('신규 고객 전용 시간대는 신규 고객 전용 배지', () => {
    expect(
      windowBadges(
        { earliestStartAt: at('2026-11-01T18:00:00+09:00'), newCustomerOnly: true },
        NOW,
      ),
    ).toEqual(['newCustomerOnly']);
  });
});
