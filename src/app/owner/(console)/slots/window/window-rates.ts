// 시간대 매물 할인율 수정 (11/16 정민석). 대시보드 시간대 줄의 [수정] 창과 서버 함수가 같이 쓴다.
// - 바꿀 수 있는 것은 서비스마다 할인율뿐이다. 시간은 바꾸지 않는다(바꾸려면 마감하고 새로 등록)
// - 할인율은 등록과 같은 선택지(10~50%)이고, 할인가는 등록과 같은 계산(calcSalePrice)으로 서버가 다시 만든다
// - 올린 서비스를 빼거나 더하지 않는다. 보낸 서비스가 시간대의 서비스와 다르면 받지 않는다
// - 이미 예약됐거나 손님이 결제 중인 칸은 [예약하기] 때 값을 복사해 둔 매물이라 그 가격 그대로다. 새 할인율은 다음 [예약하기]부터

import { z } from 'zod';

import { calcSalePrice, DISCOUNT_RATE_OPTIONS, type DiscountRate } from '@/server/policy';

/** 시간대 서비스 하나의 지금 값 */
export type WindowRateMenu = { menuId: string; listPrice: number; discountRate: number };

/** 저장할 서비스 하나 */
export type WindowRateUpdate = { menuId: string; discountRate: DiscountRate; salePrice: number };

export const WINDOW_RATES_MESSAGES = {
  INVALID_INPUT: '서비스마다 할인율을 골라 주세요',
  WINDOW_NOT_FOUND: '시간대 매물을 찾을 수 없어요',
  WINDOW_CLOSED: '이미 마감했거나 시간이 지난 시간대 매물이라 고칠 수 없어요',
  MENUS_CHANGED: '시간대의 서비스가 바뀌었어요. 화면을 새로 고친 뒤 다시 골라 주세요',
} as const;

export type WindowRatesProblem = keyof typeof WINDOW_RATES_MESSAGES;

/** 시간을 바꾸려면 어떻게 하는지(창 위 안내) */
export const WINDOW_TIME_LOCKED_NOTICE =
  '시간은 바꿀 수 없어요. 시간을 바꾸려면 [마감]하고 새로 등록해 주세요.';

export const windowRatesSchema = z.object({
  windowId: z.uuid(),
  rates: z
    .array(
      z.object({
        menuId: z.uuid(),
        discountRate: z
          .number()
          .refine((rate): rate is DiscountRate =>
            (DISCOUNT_RATE_OPTIONS as readonly number[]).includes(rate),
          ),
      }),
    )
    .min(1),
});

export type WindowRatesInput = {
  windowId: string;
  rates: { menuId: string; discountRate: number }[];
};

/**
 * 보낸 할인율을 저장할 값으로. 시간대의 서비스와 정확히 같은 서비스(빠짐·더함·겹침 없음)여야 한다.
 * 할인율이 그대로인 서비스는 빼고 돌려준다(바뀐 것이 없으면 빈 목록)
 */
export function planWindowRates(
  current: readonly WindowRateMenu[],
  rates: readonly { menuId: string; discountRate: DiscountRate }[],
): { ok: true; updates: WindowRateUpdate[] } | { ok: false; problem: 'MENUS_CHANGED' } {
  const sent = new Map(rates.map((rate) => [rate.menuId, rate.discountRate]));
  const sameMenus =
    sent.size === rates.length &&
    sent.size === current.length &&
    current.every((menu) => sent.has(menu.menuId));
  if (!sameMenus) return { ok: false, problem: 'MENUS_CHANGED' };
  const updates = current.flatMap((menu) => {
    const discountRate = sent.get(menu.menuId)!;
    return discountRate === menu.discountRate
      ? []
      : [
          {
            menuId: menu.menuId,
            discountRate,
            salePrice: calcSalePrice(menu.listPrice, discountRate),
          },
        ];
  });
  return { ok: true, updates };
}
