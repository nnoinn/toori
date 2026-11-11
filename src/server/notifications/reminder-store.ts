// 예약 리마인드를 보낼 예약 읽기 (C-602, W17 ①). 서버에서만 부른다. 보내기는 reminders.ts가 한다.

import 'server-only';

import { and, asc, eq, gt, lte, notExists, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { customers, notifications, reservations, shops, slots } from '@/db/schema';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

const MINUTE_MS = 60_000;

/** 리마인드 한 건에 쓰는 값. 고객 이름·전화번호는 읽지 않는다 */
export type DueReminder = {
  reservationId: string;
  customerUserId: string;
  shopName: string;
  startAt: Date;
};

/** 시작 몇 분 전 리마인드인지에 따른 dedupe_key. notify가 같은 값으로는 한 번만 보낸다 */
export function reminderDedupeKey(minutes: number, reservationId: string): string {
  return `${reminderKeyPrefix(minutes)}${reservationId}`;
}

function reminderKeyPrefix(minutes: number): string {
  return `reservation.reminder:${minutes}m:customer:`;
}

/**
 * 지금 '시작 minutes분 전' 리마인드를 보낼 예정 예약. 시작이 빠른 것부터.
 * - 시작까지 nextMinutes분 넘게, minutes분 이하로 남은 예약만. 다음 리마인드 때가 되면 앞 리마인드는 보내지 않는다(예약 작업이 멈췄다 돌아와도 두 개가 한꺼번에 가지 않게)
 * - 리마인드 때가 지난 뒤에 확정된 예약은 뺀다(예: 1시간 전에 예약하면 2시간 전 리마인드 없음)
 * - 이미 보낸 리마인드는 뺀다
 */
export async function readDueReminders(
  db: DbReader,
  input: { minutes: number; nextMinutes: number; now: Date; limit: number },
): Promise<DueReminder[]> {
  const { minutes, nextMinutes, now, limit } = input;
  const sent = db
    .select({ one: sql`1` })
    .from(notifications)
    .where(
      eq(notifications.dedupeKey, sql`${reminderKeyPrefix(minutes)} || ${reservations.id}::text`),
    );
  return db
    .select({
      reservationId: reservations.id,
      customerUserId: customers.userId,
      shopName: shops.name,
      startAt: slots.startAt,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(
      and(
        eq(reservations.status, 'confirmed'),
        lte(slots.startAt, new Date(now.getTime() + minutes * MINUTE_MS)),
        gt(slots.startAt, new Date(now.getTime() + nextMinutes * MINUTE_MS)),
        lte(reservations.createdAt, sql`${slots.startAt} - make_interval(mins => ${minutes}::int)`),
        notExists(sent),
      ),
    )
    .orderBy(asc(slots.startAt))
    .limit(limit);
}
