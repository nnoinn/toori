// 내 쿠폰 조회 getMyCoupons (#300). 매물 없이·매물과 같이 부를 때의 결과와 홀딩 확인을 본다.
// 로그인·DB 읽기·시각은 가짜로 바꿔서 DB 없이 돈다. 실제 DB 조건은 coupon-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import type { CheckoutSlot } from '@/server/payments/checkout-store';

import type { CouponRow } from './rules';

const SLOT = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const NOW = new Date('2026-11-11T03:00:00.000Z');
const day = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  slot: null as CheckoutSlot | null,
  usable: [] as CouponRow[],
  reads: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireCustomer: async () => state.auth }));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/server/payments/checkout-store', () => ({
  readCheckoutSlot: async () => state.slot,
}));
vi.mock('./coupon-store', () => ({
  readUsableCoupons: async (_db: unknown, input: unknown) => {
    state.reads.push(input);
    return state.usable;
  },
}));

const { getMyCoupons } = await import('./coupons');

function heldSlot(extra: Partial<CheckoutSlot> = {}): CheckoutSlot {
  return {
    slotId: SLOT,
    shopId: 'shop-1',
    shopName: '샘플 헤어',
    menuName: '커트',
    status: 'published',
    publishAt: day(-1),
    startAt: day(1),
    salePrice: 3100,
    newCustomerOnly: false,
    holdCustomerId: 'customer-1',
    holdExpiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    ...extra,
  };
}

beforeEach(() => {
  state.auth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.now = NOW;
  state.slot = heldSlot();
  state.usable = [
    { couponId: 'big', amount: 3000, expiresAt: day(30), usedOrderId: null },
    { couponId: 'small', amount: 1000, expiresAt: day(60), usedOrderId: null },
  ];
  state.reads = [];
});

describe('getMyCoupons', () => {
  it('매물 없이(내 정보): 내 고객 id와 서버 시각으로 읽고 기한 빠른 순, 기본 쿠폰 없음', async () => {
    const result = await getMyCoupons();
    expect(state.reads).toEqual([{ customerId: 'customer-1', now: NOW }]);
    expect(result).toEqual(
      ok({
        coupons: [
          { couponId: 'big', amount: 3000, expiresAt: day(30).toISOString(), applicable: true },
          { couponId: 'small', amount: 1000, expiresAt: day(60).toISOString(), applicable: true },
        ],
        defaultCouponId: null,
      }),
    );
  });

  it('내가 홀딩한 매물: 그 매물에 쓸 수 있는 쿠폰이 먼저, 못 쓰는 쿠폰은 뒤, 기본은 첫 번째', async () => {
    const result = await getMyCoupons({ slotId: SLOT });
    expect(result).toMatchObject({
      ok: true,
      data: {
        coupons: [
          { couponId: 'small', applicable: true },
          { couponId: 'big', applicable: false },
        ],
        defaultCouponId: 'small',
      },
    });
  });

  it('홀딩하지 않았거나 다른 고객이 홀딩했으면 NOT_HOLDER, 내 홀딩이 끝났으면 HOLD_EXPIRED', async () => {
    expect(await getMyCoupons({ slotId: 'nope' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOLDER' },
    });
    state.slot = null;
    expect(await getMyCoupons({ slotId: SLOT })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOLDER' },
    });
    state.slot = heldSlot({ holdCustomerId: 'customer-2' });
    expect(await getMyCoupons({ slotId: SLOT })).toMatchObject({
      ok: false,
      error: { code: 'NOT_HOLDER' },
    });
    state.slot = heldSlot({ holdExpiresAt: new Date(NOW.getTime() - 1000) });
    expect(await getMyCoupons({ slotId: SLOT })).toMatchObject({
      ok: false,
      error: { code: 'HOLD_EXPIRED' },
    });
    expect(state.reads).toEqual([]);
  });

  it('로그인·고객 모드 실패는 그대로', async () => {
    state.auth = fail('UNAUTHENTICATED', '로그인해 주세요');
    expect(await getMyCoupons()).toEqual(fail('UNAUTHENTICATED', '로그인해 주세요'));
  });
});
