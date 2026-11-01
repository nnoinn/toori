// 관심 동네 저장 (C-601, 연결 #12, #131). 서버에서만 부른다. 고객 계정 기준이다.
// 관심 동네 새 매물 알림(W17)은 광고성 정보 수신에 동의한 고객에게만 보낸다(보낼 때 본다).

import 'server-only';

import { and, eq, notInArray } from 'drizzle-orm';

import type { getDb } from '@/db';
import { interestAreas } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export async function readInterestAreas(
  db: Pick<Db, 'select'>,
  customerId: string,
): Promise<string[]> {
  const rows = await db
    .select({ sigunguCode: interestAreas.sigunguCode })
    .from(interestAreas)
    .where(eq(interestAreas.customerId, customerId));
  return rows.map((row) => row.sigunguCode);
}

/** 관심 동네를 이 목록으로 바꾼다(빠진 동네는 지우고 새 동네는 더한다). 트랜잭션 안에서 부른다 */
export async function replaceInterestAreas(
  tx: Pick<Db, 'insert' | 'delete'>,
  customerId: string,
  sigunguCodes: readonly string[],
): Promise<void> {
  await tx
    .delete(interestAreas)
    .where(
      sigunguCodes.length === 0
        ? eq(interestAreas.customerId, customerId)
        : and(
            eq(interestAreas.customerId, customerId),
            notInArray(interestAreas.sigunguCode, [...sigunguCodes]),
          ),
    );
  if (sigunguCodes.length === 0) return;
  await tx
    .insert(interestAreas)
    .values(sigunguCodes.map((sigunguCode) => ({ customerId, sigunguCode })))
    .onConflictDoNothing({ target: [interestAreas.customerId, interestAreas.sigunguCode] });
}
