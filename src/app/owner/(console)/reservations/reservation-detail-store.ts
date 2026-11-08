// 원장님 예약 상세 조회 (DB, O11, S-403). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 그 샵 매물의 예약만 읽는다(X-102). 다른 샵 예약이나 모양이 틀린 id는 없는 예약과 같게 null이다.
// 예약자 연락처를 읽으니 값을 로그에 남기지 않는다.

import 'server-only';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db';
import {
  type CancelActor,
  customers,
  type ReservationStatus,
  reservations,
  slots,
  type VisitResult,
} from '@/db/schema';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

const reservationIdSchema = z.uuid();

export type OwnerReservation = {
  id: string;
  /** 예약번호(8자리) */
  code: string;
  status: ReservationStatus;
  visitResult: VisitResult | null;
  visitRecordedAt: Date | null;
  cancelledAt: Date | null;
  cancelActor: CancelActor | null;
  /** 예약 확정 시각 */
  createdAt: Date;
  slotId: string;
  startAt: Date;
  endAt: Date;
  serviceType: string;
  menuName: string;
  durationMinutes: number;
  listPrice: number;
  discountRate: number;
  /** 판매가. 쿠폰을 써도 원장님 정산은 이 금액 기준이다 */
  salePrice: number;
  newCustomerOnly: boolean;
  customerNickname: string;
  /** 예약 전에 꼭 받지만 W11 전 시드 예약은 비어 있을 수 있다 */
  customerPhone: string | null;
};

/** 그 샵 매물의 예약 한 건과 예약자 닉네임·휴대폰. 없거나 다른 샵 예약이거나 id 모양이 틀리면 null */
export async function selectOwnerReservation(
  db: Db,
  shopId: string,
  reservationId: string,
): Promise<OwnerReservation | null> {
  if (!reservationIdSchema.safeParse(reservationId).success) return null;
  const [row] = await db
    .select({
      id: reservations.id,
      code: reservations.code,
      status: reservations.status,
      visitResult: reservations.visitResult,
      visitRecordedAt: reservations.visitRecordedAt,
      cancelledAt: reservations.cancelledAt,
      cancelActor: reservations.cancelActor,
      createdAt: reservations.createdAt,
      slotId: slots.id,
      startAt: slots.startAt,
      endAt: slots.endAt,
      serviceType: slots.serviceType,
      menuName: slots.menuName,
      durationMinutes: slots.durationMinutes,
      listPrice: slots.listPrice,
      discountRate: slots.discountRate,
      salePrice: slots.salePrice,
      newCustomerOnly: slots.newCustomerOnly,
      customerNickname: customers.nickname,
      customerPhone: customers.phone,
    })
    .from(reservations)
    .innerJoin(slots, eq(slots.id, reservations.slotId))
    .innerJoin(customers, eq(customers.id, reservations.customerId))
    .where(and(eq(reservations.id, reservationId), eq(slots.shopId, shopId)));
  if (!row) return null;
  return {
    ...row,
    // 세 값은 DB 제약(reservations_*_check)으로 정해진 값만 들어간다
    status: row.status as ReservationStatus,
    visitResult: row.visitResult as VisitResult | null,
    cancelActor: row.cancelActor as CancelActor | null,
  };
}
