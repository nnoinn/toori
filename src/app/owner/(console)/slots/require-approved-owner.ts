// 매물 서버 함수(등록·수정·마감·재등록)가 맨 먼저 하는 확인 (S-102, X-102). 서버에서만 부른다.
// 로그인한 원장님의 샵인지(requireShopOwner) 본 뒤, 입점 승인을 받았는지(assertShopApproved) 본다.
// 승인 전에는 화면도 매물 메뉴를 막지만, 서버 함수는 화면을 거치지 않고도 부를 수 있어서 여기서 다시 막는다.

import 'server-only';

import type { Result } from '@/lib/result';
import { type OwnerAuth, requireShopOwner } from '@/server/auth';
import { assertShopApproved } from '@/server/shops';

/** 그 샵 원장님이고 입점 승인을 받았으면 원장님 정보(userId 등). 아니면 그 이유 */
export async function requireApprovedOwner(shopId: string): Promise<Result<OwnerAuth>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const approved = await assertShopApproved(shopId);
  if (!approved.ok) return approved;
  return auth;
}
