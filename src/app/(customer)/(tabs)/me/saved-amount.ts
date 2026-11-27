// 투리로 아낀 금액 (C-108). 내 정보 맨 위에 보여 준다. 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 🟡 계산(docs/stage3-spec.md C-108): 방문 완료 예약의 (정가 − 실제 결제액)을 더한다.
//   - 노쇼·취소된 예약은 뺀다. 운영자가 무효로 한 예약(A-108, 결제액을 모두 돌려받음)도 뺀다
//   - 쿠폰으로 덜 낸 금액은 넣는다(실제 결제액 = 할인가 − 쿠폰이라 저절로 들어간다)
// 본인 고객 계정의 예약만 본다(X-102). customerId는 ensureCustomerPage()에서 받은 값을 넘긴다

import 'server-only';

import { and, count, eq, isNull, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { orders, reservations, slots } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type SavedAmount = {
  /** 아낀 금액 합(원) */
  total: number;
  /** 더한 예약(방문 완료) 수 */
  visits: number;
};

export async function selectSavedAmount(db: DbReader, customerId: string): Promise<SavedAmount> {
  const [row] = await db
    .select({
      // 정가는 매물의 당시 값, 실제 결제액은 주문의 값(쿠폰을 뺀 뒤)
      total: sql<number>`coalesce(sum(${slots.listPrice} - ${orders.amount}), 0)`.mapWith(Number),
      visits: count(),
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(orders, eq(orders.id, reservations.orderId))
    .where(
      and(
        eq(reservations.customerId, customerId),
        eq(reservations.status, 'completed'),
        eq(reservations.visitResult, 'visited'),
        isNull(reservations.voidedAt),
      ),
    );
  return { total: row?.total ?? 0, visits: row?.visits ?? 0 };
}
