// 예약·결제에 필요한 DB 읽기 (연결 #8). 서버에서만 부른다. W10 홀딩·W11 결제도 이 함수들을 그대로 쓴다.

import 'server-only';

import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { customers, shops, slots, type SlotStatus } from '@/db/schema';
import { customerVisibleShop } from '@/server/shops/visibility';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type CheckoutSlot = {
  slotId: string;
  shopId: string;
  shopName: string;
  menuName: string;
  status: SlotStatus;
  publishAt: Date;
  startAt: Date;
  salePrice: number;
  newCustomerOnly: boolean;
  holdCustomerId: string | null;
  holdExpiresAt: Date | null;
};

/** 결제할 매물. 승인된 샵(#50)의 매물만, 없으면 null */
export async function readCheckoutSlot(
  slotId: string,
  db: DbReader = getDb(),
): Promise<CheckoutSlot | null> {
  const [row] = await db
    .select({
      slotId: slots.id,
      shopId: slots.shopId,
      shopName: shops.name,
      menuName: slots.menuName,
      status: slots.status,
      publishAt: slots.publishAt,
      startAt: slots.startAt,
      salePrice: slots.salePrice,
      newCustomerOnly: slots.newCustomerOnly,
      holdCustomerId: slots.holdCustomerId,
      holdExpiresAt: slots.holdExpiresAt,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(and(eq(slots.id, slotId), customerVisibleShop()))
    .limit(1);
  // DB의 check 제약이 6가지 상태만 허용한다
  return row ? { ...row, status: row.status as SlotStatus } : null;
}

/** 고객 연락처(휴대폰). 예약 전에 꼭 있어야 한다(schema-v1 customers.phone) */
export async function readCustomerPhone(
  customerId: string,
  db: DbReader = getDb(),
): Promise<string | null> {
  const [row] = await db
    .select({ phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, customerId));
  return row?.phone ?? null;
}
