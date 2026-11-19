// 운영자 처리 기록 남기기 (#372, #373 공통 규칙). 서버에서만 부른다.
// 데이터를 바꾸는 처리는 그 변경과 같은 트랜잭션에서 부른다. 처리 기록은 앱에서 고치거나 지울 수 없다(0016 트리거).

import 'server-only';

import type { getDb } from '@/db';
import { adminActions } from '@/db/schema';

type DbWriter = Pick<ReturnType<typeof getDb>, 'insert'>;

export type AdminActionRow = {
  adminId: string;
  /** 한 일. 예: payment.retry, refund.retry */
  action: string;
  /** 대상 종류. 예: order, reservation, refund */
  targetType: string;
  targetId: string;
  /** 사유(결과가 있으면 "결과: 사유") */
  memo: string | null;
};

/** 처리 기록 한 줄을 넣는다 */
export async function recordAdminAction(db: DbWriter, row: AdminActionRow): Promise<void> {
  await db.insert(adminActions).values(row);
}
