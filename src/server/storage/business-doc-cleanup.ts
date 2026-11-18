// 쓰이지 않는 사업자등록증 지우기 (#478, 11/17 nnoinn, #116 리뷰). 서버에서만 부른다.
// 매일 오후 1시 새 매물 알림 예약 작업(/api/cron/slot-digest)이 알림 보내기가 끝난 뒤 부르고, 지운 수가 예약 작업 기록에 남는다.
//
// 등록증은 비공개 버킷 business-docs에 있다(paths.ts): 가입 중 users/{userId}/…, 반려 뒤 다시 낼 때 shops/{shopId}/….
// 샵에는 지금 쓰는 등록증 경로 하나만 저장한다(shops.business_doc_path). 그래서 어느 샵도 가리키지 않는 파일이 지울 후보이고,
// 쓰이지 않게 된 지 BUSINESS_DOC_KEEP_DAYS(30일)가 지나면 지운다.
// - 가입하다 그만둔 경우(그 사람의 샵이 없음): 올린 날부터 센다
// - 다시 낸 경우의 옛 등록증(그 샵이나 그 사람의 샵이 있음): 지금 쓰는 등록증을 올린 날(= 다시 낸 날)부터 센다
// 지금 어느 샵이든 가리키는 파일과, 두 폴더 밖의 파일은 지우지 않는다.
// 파일 목록은 DB의 storage.objects에서 읽고(읽기만), 지우기는 Storage API로 한다(표를 직접 지우면 파일이 남는다)

import 'server-only';

import { eq, sql } from 'drizzle-orm';

import type { getDb } from '@/db';
import { owners, shops } from '@/db/schema';
import { BUSINESS_DOC_KEEP_DAYS } from '@/server/policy';
import { createSupabaseAdminClient } from '@/server/supabase/admin';

import { STORAGE_BUCKETS } from './paths';

type DbReader = Pick<ReturnType<typeof getDb>, 'select' | 'execute'>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Storage API에 한 번에 지우라고 넘기는 파일 수 */
const REMOVE_BATCH = 100;

/** business-docs 버킷의 파일 하나(버킷 안 경로) */
export type BusinessDocObject = { path: string; createdAt: Date };

/** 샵이 지금 쓰는 등록증 경로와 그 샵의 원장님 로그인 id */
export type BusinessDocRef = { shopId: string; ownerUserId: string; path: string };

/** 지울 등록증 경로. 어느 샵도 가리키지 않고 쓰이지 않게 된 지 BUSINESS_DOC_KEEP_DAYS가 지난 파일 */
export function pickStaleBusinessDocs(
  objects: readonly BusinessDocObject[],
  refs: readonly BusinessDocRef[],
  now: Date,
): string[] {
  const createdAt = new Map(objects.map((object) => [object.path, object.createdAt.getTime()]));
  const referenced = new Set(refs.map((ref) => ref.path));
  const cutoff = now.getTime() - BUSINESS_DOC_KEEP_DAYS * DAY_MS;

  /** 그 폴더 주인의 샵들이 지금 쓰는 등록증을 올린 가장 늦은 시각. 샵이 없으면 null */
  function currentDocUploadedAt(folder: 'users' | 'shops', id: string): number | null {
    const owned = refs.filter((ref) => (folder === 'users' ? ref.ownerUserId : ref.shopId) === id);
    if (owned.length === 0) return null;
    // 시드처럼 파일이 없는 경로는 셀 수 없어서 뺀다
    const times = owned.flatMap((ref) => {
      const time = createdAt.get(ref.path);
      return time === undefined ? [] : [time];
    });
    return times.length === 0 ? null : Math.max(...times);
  }

  return objects
    .filter((object) => {
      if (referenced.has(object.path)) return false;
      const [folder, id] = object.path.split('/');
      if ((folder !== 'users' && folder !== 'shops') || !id) return false;
      const current = currentDocUploadedAt(folder, id);
      // 쓰이지 않게 된 때: 샵이 없으면 올린 때, 있으면 지금 쓰는 등록증을 올린 때(이 파일이 더 늦으면 이 파일을 올린 때)
      const unusedSince = Math.max(object.createdAt.getTime(), current ?? 0);
      return unusedSince <= cutoff;
    })
    .map((object) => object.path);
}

/** business-docs 버킷의 파일 목록(storage.objects, 읽기만) */
export async function readBusinessDocObjects(db: DbReader): Promise<BusinessDocObject[]> {
  const rows = await db.execute<{ name: string; created_at: Date | string }>(
    sql`select name, created_at from storage.objects where bucket_id = ${STORAGE_BUCKETS.businessDocs}`,
  );
  return rows.map((row) => ({ path: row.name, createdAt: new Date(row.created_at) }));
}

/** 샵마다 지금 쓰는 등록증 경로 */
export async function readBusinessDocRefs(db: DbReader): Promise<BusinessDocRef[]> {
  return db
    .select({ shopId: shops.id, ownerUserId: owners.userId, path: shops.businessDocPath })
    .from(shops)
    .innerJoin(owners, eq(owners.id, shops.ownerId));
}

/** Storage에서 지운다. 실패한 묶음의 파일 수를 돌려준다(다음 날 다시 지운다) */
async function removeBusinessDocs(paths: readonly string[]): Promise<number> {
  let failed = 0;
  for (let start = 0; start < paths.length; start += REMOVE_BATCH) {
    const batch = paths.slice(start, start + REMOVE_BATCH);
    const { error } = await createSupabaseAdminClient()
      .storage.from(STORAGE_BUCKETS.businessDocs)
      .remove(batch);
    if (error) {
      failed += batch.length;
      console.error('[business-docs] 등록증 지우기 실패:', batch.length, error.message);
    }
  }
  return failed;
}

export type BusinessDocCleanup =
  | { checked: number; deleted: number; failed: number }
  /** 목록을 읽지 못했다. 다음 날 다시 한다 */
  | { error: 'unavailable' };

/**
 * 쓰이지 않는 등록증을 지운다. 새 매물 알림 작업이 보내기가 끝난 뒤 부른다.
 * 실패해도 알림 작업 결과를 바꾸지 않게 던지지 않고 결과에 남긴다(예약 작업 기록의 처리 개수에 보인다)
 */
export async function cleanUpBusinessDocs(
  db: DbReader,
  now: Date,
  remove: (paths: readonly string[]) => Promise<number> = removeBusinessDocs,
): Promise<BusinessDocCleanup> {
  let objects: BusinessDocObject[];
  let refs: BusinessDocRef[];
  try {
    [objects, refs] = await Promise.all([readBusinessDocObjects(db), readBusinessDocRefs(db)]);
  } catch (error) {
    console.error(
      '[business-docs] 등록증 목록 읽기 실패:',
      error instanceof Error ? error.name : error,
    );
    return { error: 'unavailable' };
  }
  const stale = pickStaleBusinessDocs(objects, refs, now);
  if (stale.length === 0) return { checked: objects.length, deleted: 0, failed: 0 };
  const failed = await remove(stale).catch((error: unknown) => {
    console.error(
      '[business-docs] 등록증 지우기 실패:',
      error instanceof Error ? error.name : error,
    );
    return stale.length;
  });
  return { checked: objects.length, deleted: stale.length - failed, failed };
}
