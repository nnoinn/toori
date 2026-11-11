'use server';

// 내 쿠폰 조회 (C-407, 연결 #17, #300). 예약 확인 화면의 쿠폰 고르기(정찬형 J17)와 내 정보의 쿠폰 줄(Q2)에서 부른다.
// 화면에서는 '@/server/coupons/coupons'에서 가져온다. 쿠폰을 고른 뒤 금액은 previewCheckoutAmount(@/server/payments/checkout)로 받는다.

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer } from '@/server/auth';
import { isMyActiveHold } from '@/server/payments/checkout-rules';
import { readCheckoutSlot } from '@/server/payments/checkout-store';
import { paymentFail, type PaymentResult } from '@/server/payments/errors';

import { readUsableCoupons } from './coupon-store';
import { arrangeCoupons, arrangeCouponsForSlot } from './rules';
import type { MyCoupons } from './types';

const slotIdSchema = z.uuid();

/**
 * 내가 지금 쓸 수 있는 쿠폰.
 * - 매물 없이(내 정보): 기한 빠른 순. "쿠폰 N장 · 가장 빠른 기한"은 개수와 첫 번째 기한
 * - { slotId }(예약 확인 화면): 내가 홀딩한 매물이어야 한다(아니면 NOT_HOLDER, 홀딩이 끝났으면 HOLD_EXPIRED).
 *   그 매물에 쓸 수 있는 쿠폰을 할인 큰 순으로 먼저 주고, 기본으로 골라 둘 쿠폰은 defaultCouponId
 */
export async function getMyCoupons(input?: { slotId?: string }): Promise<PaymentResult<MyCoupons>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const { customerId } = auth.data;
  const now = await getRequestNow();

  if (input?.slotId === undefined) {
    return ok(arrangeCoupons(await readUsableCoupons(getDb(), { customerId, now })));
  }
  if (!slotIdSchema.safeParse(input.slotId).success) return paymentFail('NOT_HOLDER');
  const slot = await readCheckoutSlot(input.slotId);
  if (!slot || slot.holdCustomerId !== customerId) return paymentFail('NOT_HOLDER');
  if (!isMyActiveHold(slot, customerId, now)) return paymentFail('HOLD_EXPIRED');
  const usable = await readUsableCoupons(getDb(), { customerId, now });
  return ok(arrangeCouponsForSlot(usable, slot.salePrice));
}
