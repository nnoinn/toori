// 운영자 고객 상세 '쿠폰' 칸의 표시 모양(A-102, C-407)

import { describe, expect, it } from 'vitest';

import {
  couponReturnReason,
  couponState,
  customerCouponViews,
  usableCouponSummary,
} from './coupon-format';
import type { CustomerCouponRow, CustomerCouponUse } from './coupon-queries';

const at = (iso: string) => new Date(`${iso}+09:00`);
const NOW = at('2026-11-20T12:00:00');
const EXPIRES_AT = at('2027-02-18T12:00:00');

function use(orderId: string, extra: Partial<CustomerCouponUse> = {}): CustomerCouponUse {
  return {
    reservationId: `reservation-${orderId}`,
    code: `code-${orderId}`,
    orderId,
    cancelActor: null,
    voidedAt: null,
    ...extra,
  };
}

function coupon(extra: Partial<CustomerCouponRow> = {}): CustomerCouponRow {
  return {
    couponId: 'coupon-1',
    amount: 3000,
    reason: 'owner_fault_compensation',
    source: { reservationId: 'reservation-source', code: 'code-source' },
    issuedAt: at('2026-11-20T09:00:00'),
    expiresAt: EXPIRES_AT,
    usedOrderId: null,
    usedAt: null,
    uses: [],
    ...extra,
  };
}

describe('쿠폰 상태', () => {
  it('쓴 주문이 있으면 기한이 지났어도 사용함', () => {
    expect(couponState({ usedOrderId: 'order-1', expiresAt: EXPIRES_AT }, NOW)).toBe('used');
    expect(couponState({ usedOrderId: 'order-1', expiresAt: at('2026-11-01T00:00:00') }, NOW)).toBe(
      'used',
    );
  });

  it('안 쓴 쿠폰은 기한 1분 전까지 쓸 수 있고, 기한과 같은 시각부터 기한 지남', () => {
    const expiresAt = at('2026-11-20T12:01:00');
    expect(couponState({ usedOrderId: null, expiresAt }, NOW)).toBe('usable');
    expect(couponState({ usedOrderId: null, expiresAt: NOW }, NOW)).toBe('expired');
  });
});

describe('돌려받은 이유', () => {
  it('원장님 사정 취소면 원장님 사정 취소, 무효면 무효', () => {
    expect(couponReturnReason({ cancelActor: 'owner_fault', voidedAt: null })).toBe('owner_fault');
    expect(couponReturnReason({ cancelActor: null, voidedAt: NOW })).toBe('void');
  });

  it('고객이 취소한 뒤 무효로 했으면 무효', () => {
    expect(couponReturnReason({ cancelActor: 'customer', voidedAt: NOW })).toBe('void');
  });

  it('원장님 사정 취소 뒤 무효로 했으면 원장님 사정 취소(그때 이미 돌려줬다)', () => {
    expect(couponReturnReason({ cancelActor: 'owner_fault', voidedAt: NOW })).toBe('owner_fault');
  });

  it('돌려주지 않는 취소(고객·합의 후)만 있으면 모름', () => {
    expect(couponReturnReason({ cancelActor: 'customer', voidedAt: null })).toBeNull();
    expect(couponReturnReason({ cancelActor: 'agreed', voidedAt: null })).toBeNull();
  });
});

describe('화면에 보여 줄 쿠폰', () => {
  it('받은 이유 이름과 원인 예약을 그대로 보여 준다', () => {
    const [view] = customerCouponViews([coupon()], NOW);
    expect(view).toMatchObject({
      reasonLabel: '원장님 사정 취소 보상',
      source: { reservationId: 'reservation-source', code: 'code-source' },
      state: 'usable',
      usedOn: null,
      usedAt: null,
      returns: [],
    });
  });

  it('사용함이면 지금 쓴 예약과 시각을 보여 주고, 돌려받은 기록에는 넣지 않는다', () => {
    const usedAt = at('2026-11-19T10:00:00');
    const [view] = customerCouponViews(
      [coupon({ usedOrderId: 'order-1', usedAt, uses: [use('order-1')] })],
      NOW,
    );
    expect(view.state).toBe('used');
    expect(view.usedOn).toEqual({ reservationId: 'reservation-order-1', code: 'code-order-1' });
    expect(view.usedAt).toEqual(usedAt);
    expect(view.returns).toEqual([]);
  });

  it('고객이 취소한 예약에 쓴 쿠폰은 돌려주지 않아서 사용함 그대로다', () => {
    const [view] = customerCouponViews(
      [
        coupon({
          usedOrderId: 'order-1',
          usedAt: NOW,
          uses: [use('order-1', { cancelActor: 'customer' })],
        }),
      ],
      NOW,
    );
    expect(view.state).toBe('used');
    expect(view.returns).toEqual([]);
  });

  it('돌려받은 뒤 다시 쓴 쿠폰: 돌려받은 예약은 기록으로, 지금 쓴 예약은 사용함으로', () => {
    const [view] = customerCouponViews(
      [
        coupon({
          usedOrderId: 'order-3',
          usedAt: NOW,
          uses: [
            use('order-1', { cancelActor: 'owner_fault' }),
            use('order-2', { cancelActor: 'customer', voidedAt: NOW }),
            use('order-3'),
          ],
        }),
      ],
      NOW,
    );
    expect(view.state).toBe('used');
    expect(view.usedOn?.code).toBe('code-order-3');
    expect(view.returns).toEqual([
      {
        reservationId: 'reservation-order-1',
        code: 'code-order-1',
        label: '원장님 사정 취소로 돌려받음',
      },
      { reservationId: 'reservation-order-2', code: 'code-order-2', label: '무효로 돌려받음' },
    ]);
  });

  it('돌려받고 아직 안 쓴 쿠폰은 쓸 수 있음(기한은 원래 그대로)', () => {
    const [view] = customerCouponViews(
      [coupon({ uses: [use('order-1', { voidedAt: NOW })] })],
      NOW,
    );
    expect(view.state).toBe('usable');
    expect(view.expiresAt).toEqual(EXPIRES_AT);
    expect(view.returns.map((item) => item.label)).toEqual(['무효로 돌려받음']);
  });

  it('지금 쓴 예약을 찾지 못하면 사용함만 보여 준다', () => {
    const [view] = customerCouponViews([coupon({ usedOrderId: 'order-9', usedAt: NOW })], NOW);
    expect(view.state).toBe('used');
    expect(view.usedOn).toBeNull();
  });

  it('순서는 받은 그대로다', () => {
    const views = customerCouponViews(
      [coupon({ couponId: 'new' }), coupon({ couponId: 'old' })],
      NOW,
    );
    expect(views.map((view) => view.couponId)).toEqual(['new', 'old']);
  });
});

describe('맨 위 요약', () => {
  it('쓸 수 있는 쿠폰만 세고 금액을 더한다(사용함·기한 지남 제외)', () => {
    const views = customerCouponViews(
      [
        coupon({ couponId: 'a', amount: 3000 }),
        coupon({ couponId: 'b', amount: 5000 }),
        coupon({ couponId: 'used', usedOrderId: 'order-1', usedAt: NOW }),
        coupon({ couponId: 'expired', expiresAt: NOW }),
      ],
      NOW,
    );
    expect(usableCouponSummary(views)).toEqual({ count: 2, total: 8000 });
  });

  it('쿠폰이 없으면 0장 0원', () => {
    expect(usableCouponSummary([])).toEqual({ count: 0, total: 0 });
  });
});
