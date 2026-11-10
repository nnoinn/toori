// 관심 동네·찜한 샵 새 매물 알림(slot.digest)에 쓸 고객과 매물 읽기 (C-601·C-209, W17 ②, #270). 서버에서만 부른다.
// 보내기는 digest.ts가 한다.

import 'server-only';

import { and, asc, eq, exists, gt, inArray, isNull, lte, notExists, or, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import {
  customers,
  favorites,
  interestAreas,
  notifications,
  pushSubscriptions,
  shops,
  slots,
  termsAgreements,
} from '@/db/schema';
import { slotStatusIs } from '@/features/slot-status/slot-status-sql';
import { newCustomerOnlyVisible } from '@/server/customers/new-customer';
import { customerVisibleShop } from '@/server/shops/visibility';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

export type DigestCustomer = { customerId: string; userId: string };

/** 알림에 담을 매물 하나. 같은 매물은 한 줄이다(관심 동네와 찜에 다 걸려도) */
export type DigestSlot = {
  slotId: string;
  discountRate: number;
  sigunguCode: string;
  /** shops.sigungu. 동네 목록에 없는 코드일 때 이름으로 쓴다 */
  sigungu: string;
  /** 고객의 관심 동네 매물인지 */
  inArea: boolean;
  /** 고객이 찜한 샵 매물인지 */
  favorite: boolean;
};

const EVENT = 'slot.digest';

/** 고객마다 하루 한 번. dateKey는 한국 날짜(YYYY-MM-DD) */
export function digestDedupeKey(customerId: string, dateKey: string): string {
  return `${EVENT}:customer:${customerId}:${dateKey}`;
}

/**
 * 오늘 알림을 받을 수 있는 고객. 고객 id 순서.
 * '관심 동네·찜한 샵 새 매물 알림' 동의(interest_alert)가 켜져 있고, 고객 알림을 켠 기기가 있고,
 * 관심 동네나 찜한 샵이 있고, 오늘 아직 이 알림을 받지 않은 고객
 */
export async function readDigestCustomers(
  db: DbReader,
  input: { dateKey: string; limit: number },
): Promise<DigestCustomer[]> {
  const one = { one: sql`1` };
  const consented = db
    .select(one)
    .from(termsAgreements)
    .where(
      and(
        eq(termsAgreements.userId, customers.userId),
        eq(termsAgreements.accountType, 'customer'),
        eq(termsAgreements.termsType, 'interest_alert'),
        isNull(termsAgreements.withdrawnAt),
      ),
    );
  const subscribed = db
    .select(one)
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, customers.userId),
        eq(pushSubscriptions.accountType, 'customer'),
      ),
    );
  const hasArea = db
    .select(one)
    .from(interestAreas)
    .where(eq(interestAreas.customerId, customers.id));
  const hasFavorite = db.select(one).from(favorites).where(eq(favorites.customerId, customers.id));
  const sentToday = db
    .select(one)
    .from(notifications)
    .where(
      eq(
        notifications.dedupeKey,
        sql`${`${EVENT}:customer:`} || ${customers.id}::text || ${`:${input.dateKey}`}`,
      ),
    );
  return db
    .select({ customerId: customers.id, userId: customers.userId })
    .from(customers)
    .where(
      and(
        exists(consented),
        exists(subscribed),
        or(exists(hasArea), exists(hasFavorite)),
        notExists(sentToday),
      ),
    )
    .orderBy(asc(customers.id))
    .limit(input.limit);
}

/**
 * 한 고객에게 알릴 새 매물. 게시 시각이 since 뒤이고 지금 게시중인 매물 중 관심 동네나 찜한 샵의 것.
 * 고객 목록과 같은 조건: 승인된 샵만, 신규 고객 전용 매물은 이 고객이 그 샵 이력이 없을 때만(#270, #49).
 * 게시 시각이 아직 오지 않은 매물은 넣지 않는다(#282)
 */
export async function readDigestSlots(
  db: DbReader,
  input: { customerId: string; since: Date; now: Date },
): Promise<DigestSlot[]> {
  const { customerId, since, now } = input;
  const areaCodes = db
    .select({ code: interestAreas.sigunguCode })
    .from(interestAreas)
    .where(eq(interestAreas.customerId, customerId));
  const favoriteShop = db
    .select({ one: sql`1` })
    .from(favorites)
    .where(and(eq(favorites.customerId, customerId), eq(favorites.shopId, shops.id)));
  const inArea = inArray(shops.sigunguCode, areaCodes);
  const favorite = exists(favoriteShop);
  return db
    .select({
      slotId: slots.id,
      discountRate: slots.discountRate,
      sigunguCode: shops.sigunguCode,
      sigungu: shops.sigungu,
      inArea: sql<boolean>`${inArea}`,
      favorite: sql<boolean>`${favorite}`,
    })
    .from(slots)
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .where(
      and(
        slotStatusIs('published', now),
        gt(slots.publishAt, since),
        lte(slots.publishAt, now),
        customerVisibleShop(),
        newCustomerOnlyVisible(customerId),
        or(inArea, favorite),
      ),
    )
    .orderBy(asc(slots.publishAt));
}
