// 화면(페이지·레이아웃)용 권한 확인 (Issue #47 2·3장). 실패하면 결과를 돌려주지 않고 알맞은 화면으로 보낸다.
// 첫 진입 안내용이다. 데이터를 읽고 저장하는 서버 함수는 따로 첫 줄에서 require…()를 부른다.
// <Suspense> 안의 서버 컴포넌트에서 부른다(current-account.ts 머리말).

import 'server-only';

import { notFound, redirect } from 'next/navigation';

import { safeNextPath } from '@/lib/safe-next';

import type { AccountMode } from './current-account';
import { type OwnerAuth, requireAdmin, requireCustomer, requireOwner } from './require';

/** 로그인 화면(정찬형, #47 8장). 토글 처음 값과 로그인 뒤 돌아갈 주소를 붙인다 */
function loginPath(mode: AccountMode, next: string) {
  return `/login?${new URLSearchParams({ mode, next })}`;
}

/**
 * 고객 화면. 로그인 안 했거나 원장님 모드면 로그인 화면으로, 고객 계정이 없으면 약관 화면(/join)으로 보낸다.
 * next는 지금 화면 주소. 로그인·약관 동의 뒤 여기로 돌아온다
 */
export async function ensureCustomerPage(
  next?: string,
): Promise<{ userId: string; customerId: string }> {
  const result = await requireCustomer();
  if (result.ok) return result.data;
  const back = safeNextPath(next, '/');
  if (result.error.code === 'NO_CUSTOMER_ACCOUNT') {
    redirect(`/join?${new URLSearchParams({ next: back })}`);
  }
  redirect(loginPath('customer', back));
}

/**
 * 원장님 화면(메뉴가 있는 화면의 레이아웃). 로그인 안 했거나 고객 모드면 원장님 토글로 로그인 화면에,
 * 원장님 계정이 없으면 원장님 가입(/owner/join)으로 보낸다. /owner/join 화면에서는 부르지 않는다
 */
export async function ensureOwnerPage(next?: string): Promise<OwnerAuth> {
  const result = await requireOwner();
  if (result.ok) return result.data;
  if (result.error.code === 'NO_OWNER_ACCOUNT') redirect('/owner/join');
  redirect(loginPath('owner', safeNextPath(next, '/owner')));
}

/** 운영자 화면. 관리자가 아니면 화면이 있다는 것도 알리지 않게 404를 보여준다 */
export async function ensureAdminPage(): Promise<{ userId: string }> {
  const result = await requireAdmin();
  if (!result.ok) notFound();
  return result.data;
}
