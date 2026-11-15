// 운영자 입구 문구와 주소 값 읽기 (#372 1장). 화면과 테스트가 같이 쓴다.

import { safeNextPath } from '@/lib/safe-next';
import type { AdminLoginError } from '@/server/auth/paths';

/** 로그인 콜백이 돌려보내는 실패 이유(paths.ts AdminLoginError)와 화면 문구 */
export const ADMIN_LOGIN_ERROR_MESSAGES: Record<AdminLoginError, string> = {
  login_failed: '로그인하지 못했어요. 다시 시도해 주세요.',
  email_required:
    '이메일 제공에 동의해야 로그인할 수 있어요. 다시 로그인하면서 이메일 제공에 동의해 주세요.',
  not_admin: '운영자 계정이 아니에요. 운영자 권한이 있는 계정으로 로그인해 주세요.',
};

export const ADMIN_LOGIN_START_FAILED_MESSAGE =
  '로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

/** 주소의 실패 이유. 모르는 값이면 null(문구를 보이지 않는다) */
export function toAdminLoginError(value: string | undefined): AdminLoginError | null {
  return value && Object.hasOwn(ADMIN_LOGIN_ERROR_MESSAGES, value)
    ? (value as AdminLoginError)
    : null;
}

/** 로그인 뒤 돌아갈 운영자 화면. 운영자 화면(/admin…)이 아니거나 안전하지 않으면 운영자 첫 화면 */
export function toAdminNext(value: string | undefined): string {
  const next = safeNextPath(value, '/admin');
  return next === '/admin' || next.startsWith('/admin/') ? next : '/admin';
}
