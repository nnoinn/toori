// 권한 확인 (X-102, 연결 #2, Issue #47 2장). 데이터를 읽거나 저장하는 서버 함수는 모두 첫 줄에서 부른다.
// 레이아웃의 ensure…Page()는 첫 진입 안내용이라 믿지 않는다(화면을 옮길 때 레이아웃은 다시 실행되지 않는다).
//
// 예: const auth = await requireShopOwner(shopId);
//     if (!auth.ok) return auth;

import 'server-only';

import { fail, ok, type Result } from '@/lib/result';

import { type CurrentAccount, getCurrentAccount } from './current-account';

/** 실패 코드와 화면 문구(#47 2장). 화면은 error.message를 그대로 보여주고, 코드로 버튼 등을 나눈다 */
export const AUTH_ERRORS = {
  UNAUTHENTICATED: '로그인이 필요해요',
  WRONG_MODE_CUSTOMER: '고객 계정으로 바꿔서 이용해 주세요',
  WRONG_MODE_OWNER: '원장님 계정으로 들어와 주세요',
  NO_CUSTOMER_ACCOUNT: '약관 동의 후 이용할 수 있어요',
  NO_OWNER_ACCOUNT: '원장님 가입을 먼저 해 주세요',
  FORBIDDEN: '접근 권한이 없어요',
} as const;

/** 고객 함수. 예약·결제는 이것만 통과한다 */
export async function requireCustomer(): Promise<Result<{ userId: string; customerId: string }>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  if (account.mode !== 'customer') return fail('WRONG_MODE', AUTH_ERRORS.WRONG_MODE_CUSTOMER);
  if (!account.customerId) return fail('NO_CUSTOMER_ACCOUNT', AUTH_ERRORS.NO_CUSTOMER_ACCOUNT);
  return ok({ userId: account.userId, customerId: account.customerId });
}

export type OwnerAuth = { userId: string; ownerId: string; shopId: string };

/** 원장님 함수 */
export async function requireOwner(): Promise<Result<OwnerAuth>> {
  return checkOwner(await getCurrentAccount());
}

/** 원장님 함수 중 특정 샵의 데이터를 다룰 때. 그 샵의 주인인지까지 확인한다 */
export async function requireShopOwner(shopId: string): Promise<Result<OwnerAuth>> {
  const result = checkOwner(await getCurrentAccount());
  if (!result.ok) return result;
  if (result.data.shopId !== shopId) return fail('FORBIDDEN', AUTH_ERRORS.FORBIDDEN);
  return result;
}

/** 운영자 함수. 계정 종류(모드)와 상관없이 profiles.is_admin으로 판단한다 */
export async function requireAdmin(): Promise<Result<{ userId: string }>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  if (!account.isAdmin) return fail('FORBIDDEN', AUTH_ERRORS.FORBIDDEN);
  return ok({ userId: account.userId });
}

function checkOwner(account: CurrentAccount | null): Result<OwnerAuth> {
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  if (account.mode !== 'owner') return fail('WRONG_MODE', AUTH_ERRORS.WRONG_MODE_OWNER);
  // 원장님 계정과 샵은 가입 때 한 트랜잭션으로 만들어지므로 둘 중 하나라도 없으면 가입 전이다
  if (!account.ownerId || !account.shopId) {
    return fail('NO_OWNER_ACCOUNT', AUTH_ERRORS.NO_OWNER_ACCOUNT);
  }
  return ok({ userId: account.userId, ownerId: account.ownerId, shopId: account.shopId });
}
