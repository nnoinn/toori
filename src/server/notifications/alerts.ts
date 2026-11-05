// 이벤트별 알림 (연결 #12, #131). 서버에서만 부른다. 문구와 눌렀을 때 열 주소는 #131 표와 같다.
// 응답을 보낸 뒤 보내서 결제·취소를 늦추지 않고, 실패해도 결제·취소 결과는 그대로다.

import 'server-only';

import { eq } from 'drizzle-orm';
import { after } from 'next/server';

import type { getDb } from '@/db';
import { customers, owners, reservations, shops, slots } from '@/db/schema';
import { formatKst } from '@/lib/time';

import { notify } from './notify';

type Db = ReturnType<typeof getDb>;

function sendAfterResponse(event: string, send: () => Promise<void>) {
  after(async () => {
    try {
      await send();
    } catch (error) {
      console.error('[notify] 알림 실패:', event, error instanceof Error ? error.name : 'unknown');
    }
  });
}

/** 예약 하나의 알림에 쓰는 값. 고객 이름·전화번호는 읽지 않는다 */
async function readReservationAlert(db: Db, reservationId: string) {
  const [row] = await db
    .select({
      customerUserId: customers.userId,
      ownerUserId: owners.userId,
      shopName: shops.name,
      menuName: slots.menuName,
      startAt: slots.startAt,
    })
    .from(reservations)
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(shops, eq(shops.id, slots.shopId))
    .innerJoin(owners, eq(owners.id, shops.ownerId))
    .where(eq(reservations.id, reservationId));
  return row ?? null;
}

/** 결제가 확정됐을 때 고객과 원장님에게(C-602, S-404). 결제 확인·웹훅·정리 작업이 같은 예약으로 불러도 한 번만 간다 */
export function notifyReservationConfirmed(db: Db, reservationId: string) {
  const event = 'reservation.confirmed';
  sendAfterResponse(event, async () => {
    const alert = await readReservationAlert(db, reservationId);
    if (!alert) return;
    const when = formatKst(alert.startAt);
    await Promise.all([
      notify(db, {
        userId: alert.customerUserId,
        accountType: 'customer',
        event,
        dedupeKey: `${event}:customer:${reservationId}`,
        title: '예약이 확정됐어요',
        body: `${alert.shopName} · ${when}`,
        url: `/reservations/${reservationId}`,
      }),
      notify(db, {
        userId: alert.ownerUserId,
        accountType: 'owner',
        event,
        dedupeKey: `${event}:owner:${reservationId}`,
        title: '새 예약이 들어왔어요',
        body: `${alert.menuName} · ${when}`,
        url: `/owner/reservations/${reservationId}`,
      }),
    ]);
  });
}
