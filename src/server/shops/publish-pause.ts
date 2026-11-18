// 샵의 새 매물 게시 멈춤 확인 (#373 ④, #433, 11/15 nnoinn 결정 3). 서버에서만 부른다.
// 운영자가 멈추면(shops.publish_paused_at) 그 샵은 새 매물·시간대 매물을 올릴 수 없다. 이미 올린 매물과 예약은 그대로다.
// 원장님에게는 운영자가 적은 사유를 보이지 않는다(11/16 강규민 결정: 정산 보류처럼 숨기고 카카오톡 채널로 안내).
// 매물을 새로 만드는 서버 함수가 입점 승인 확인(assertShopApproved) 다음에 부른다: 시간대 등록(createSlotWindows),
// 한 시술 등록·재등록(정민석 slots/new/actions.ts·relist, 연결 Issue로 부탁)

import 'server-only';

import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { shops } from '@/db/schema';
import { fail, ok, type Result } from '@/lib/result';

import { PUBLISH_PAUSED_MESSAGE } from './publish-pause-message';

/** 그 샵의 게시를 멈춘 시각. 멈추지 않았거나 없는 샵이면 null(원장님 화면이 안내를 띄울 때 쓴다) */
export async function readPublishPausedAt(
  shopId: string,
  db: Pick<ReturnType<typeof getDb>, 'select'> = getDb(),
): Promise<Date | null> {
  const [row] = await db
    .select({ pausedAt: shops.publishPausedAt })
    .from(shops)
    .where(eq(shops.id, shopId));
  return row?.pausedAt ?? null;
}

/**
 * 새 매물을 올릴 수 있는지 확인한다. 게시를 멈춘 샵이면 PUBLISH_PAUSED.
 * 그 함수의 트랜잭션 안에서 확인하려면 tx를 넘긴다(assertShopApproved와 같다)
 */
export async function assertShopCanPublish(
  shopId: string,
  db: Pick<ReturnType<typeof getDb>, 'select'> = getDb(),
): Promise<Result<null>> {
  if (await readPublishPausedAt(crypto.randomUUID(), db))
    return fail('PUBLISH_PAUSED', PUBLISH_PAUSED_MESSAGE);
  return ok(null);
}
