// 운영자 예약 상세의 '합의 후 취소 요청' 칸(X-208, S-410·C-506). 원장님이 요청했는지, 손님이 답했는지를 본다. 서버에서만 부른다.
// 요청은 거절·만료 뒤에 다시 할 수 있어서 한 예약에 여러 건일 수 있다(#301). 읽기만 하고, 운영자가 대신 요청하거나 답하지는 않는다

import 'server-only';

import { desc, eq } from 'drizzle-orm';

import type { getDb } from '@/db';
import { agreedCancelRequests } from '@/db/schema';
import type { AgreedCancelRequestStatus } from '@/db/schema/refunds';
import type { AgreedCancelReason } from '@/server/refunds/agreed-cancel-types';

type DbReader = Pick<ReturnType<typeof getDb>, 'select'>;

/** 요청 한 건. 상태는 저장된 값이라, 화면은 currentRequestStatus로 지금 상태를 정한다 */
export type ReservationAgreedCancelRow = {
  requestId: string;
  reason: AgreedCancelReason;
  /** 기타일 때 원장님이 적은 내용. 아니면 null */
  reasonText: string | null;
  status: AgreedCancelRequestStatus;
  requestedAt: Date;
  /** 손님이 답할 수 있는 마지막 시각(요청 + 24시간) */
  expiresAt: Date;
  /** 동의·거절·만료·끝남을 기록한 시각. 답을 기다리는 동안 null */
  respondedAt: Date | null;
};

/** 그 예약의 합의 후 취소 요청 전부. 최근에 요청한 것부터 */
export async function selectReservationAgreedCancels(
  db: DbReader,
  reservationId: string,
): Promise<ReservationAgreedCancelRow[]> {
  const rows = await db
    .select({
      requestId: agreedCancelRequests.id,
      reason: agreedCancelRequests.reason,
      reasonText: agreedCancelRequests.reasonText,
      status: agreedCancelRequests.status,
      requestedAt: agreedCancelRequests.requestedAt,
      expiresAt: agreedCancelRequests.expiresAt,
      respondedAt: agreedCancelRequests.respondedAt,
    })
    .from(agreedCancelRequests)
    .where(eq(agreedCancelRequests.reservationId, reservationId))
    .orderBy(desc(agreedCancelRequests.requestedAt), desc(agreedCancelRequests.id));
  // DB의 check 제약이 정해 둔 사유·상태만 허용한다
  return rows.map((row) => ({
    ...row,
    reason: row.reason as AgreedCancelReason,
    status: row.status as AgreedCancelRequestStatus,
  }));
}
