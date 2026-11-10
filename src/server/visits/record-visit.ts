'use server';

// 방문·노쇼 처리 (S-405·S-406, 연결 #11, #130). 원장님 예약 상세의 '방문 완료'·'노쇼' 버튼(정민석 O14)에서 부른다.
// 화면에서는 '@/server/visits/record-visit'에서 가져온다. 버튼을 보여줄지는 '@/server/visits/rules'의 canRecordVisit.
// 누르기 전 확인 창("처리하면 바꿀 수 없어요")은 화면에서 띄운다(10/29 결정). 처리한 뒤 원장님은 바꿀 수 없고 운영자가 고친다(A-104).
// 노쇼로 처리하면 고객에게 reservation.no_show 알림(W16). TODO(#15 W15·W20): 정산 내역 한 줄(방문 sale, 노쇼 no_show)

import { z } from 'zod';

import { getDb } from '@/db';
import { VISIT_RESULTS } from '@/db/schema';
import { getRequestNow } from '@/lib/request-time';
import type { Result } from '@/lib/result';
import { requireOwner } from '@/server/auth';
import { notifyNoShow } from '@/server/notifications/alerts';

import { visitFail } from './errors';
import type { RecordedVisit, VisitResult } from './types';
import { recordVisitInTx } from './visit-store';

const resultSchema = z.enum(VISIT_RESULTS);

/** 내 샵 예약을 방문 완료(visited)·노쇼(no_show)로 처리한다. 시작 시각 전이면 TOO_EARLY, 이미 처리했으면 ALREADY_RECORDED */
export async function recordVisit(input: {
  reservationId: string;
  result: VisitResult;
}): Promise<Result<RecordedVisit>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  const reservationId = z.uuid().safeParse(input?.reservationId);
  if (!reservationId.success) return visitFail('RESERVATION_NOT_FOUND');
  const result = resultSchema.safeParse(input?.result);
  if (!result.success) return visitFail('INVALID_INPUT');

  const now = await getRequestNow();
  const db = getDb();
  const recorded = await db.transaction((tx) =>
    recordVisitInTx(tx, {
      shopId: auth.data.shopId,
      reservationId: reservationId.data,
      result: result.data,
      recordedBy: auth.data.userId,
      now,
    }),
  );
  if (recorded.ok && result.data === 'no_show') notifyNoShow(db, reservationId.data);
  return recorded;
}
