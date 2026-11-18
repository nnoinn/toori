// 쓰이지 않는 사업자등록증 고르기 (#478, 11/17 nnoinn). 계산만 한다(DB·Storage를 보지 않는다).
// 규칙 설명과 목록 읽기·지우기는 business-doc-cleanup.ts. 매주 돌연변이 테스트(stryker.config.mjs)가 이 파일을 본다.

import { BUSINESS_DOC_KEEP_DAYS } from '@/server/policy';

const DAY_MS = 24 * 60 * 60 * 1000;

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

  /** 그 폴더 주인의 샵들이 지금 쓰는 등록증을 올린 시각들. 샵이 없으면 빈 목록 */
  function currentDocUploadTimes(folder: 'users' | 'shops', id: string): number[] {
    return refs
      .filter((ref) => (folder === 'users' ? ref.ownerUserId : ref.shopId) === id)
      .flatMap((ref) => {
        // 시드처럼 파일이 없는 경로는 셀 수 없어서 뺀다
        const time = createdAt.get(ref.path);
        return time === undefined ? [] : [time];
      });
  }

  return objects
    .filter((object) => {
      if (referenced.has(object.path)) return false;
      const [folder, id] = object.path.split('/');
      if ((folder !== 'users' && folder !== 'shops') || !id) return false;
      // 쓰이지 않게 된 때: 샵이 없으면 올린 때, 있으면 지금 쓰는 등록증을 올린 때(이 파일이 더 늦으면 이 파일을 올린 때)
      const unusedSince = Math.max(
        object.createdAt.getTime(),
        ...currentDocUploadTimes(folder, id),
      );
      return unusedSince <= cutoff;
    })
    .map((object) => object.path);
}
