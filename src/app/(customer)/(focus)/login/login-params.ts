// 로그인 화면 주소 값 읽기 (J8, C-101). /login?mode=customer|owner&next=/... (#47 8장 답, #19 D21)
// next가 우리 사이트 안 주소인지는 공통 함수 safeNextPath(src/lib/safe-next.ts)로만 확인한다.

import { safeNextPath } from '@/lib/safe-next';
import { firstParam, type SearchValue } from '@/lib/search-params';
import { DEFAULT_NEXT } from '@/server/auth/paths';

export { DEFAULT_NEXT };

/** 로그인 화면 토글 값 */
export type LoginMode = 'customer' | 'owner';

const OWNER_PATH = /^\/owner(?:[/?#]|$)/;
const ADMIN_PATH = /^\/admin(?:[/?#]|$)/;

/** 고른 모드로 들어갈 수 있는 화면인지. 원장님은 /owner 아래만, 고객은 /owner·/admin이 아닌 곳 */
export function isPathForMode(path: string, mode: LoginMode): boolean {
  if (mode === 'owner') return OWNER_PATH.test(path);
  return !OWNER_PATH.test(path) && !ADMIN_PATH.test(path);
}

/**
 * 로그인하고 갈 곳(#207). next가 고른 모드의 화면이 아니면 그 모드의 기본 주소로 간다.
 * 예: 고객 화면(/me)에서 넘어온 로그인 화면에서 원장님을 고르면 /owner. 그대로 /me로 가면
 * 고객 화면이 원장님 모드를 다시 고객 로그인 화면으로 보내서 제자리로 돌아온다
 */
export function nextForMode(mode: LoginMode, nextParam: string | null): string {
  return nextParam && isPathForMode(nextParam, mode) ? nextParam : DEFAULT_NEXT[mode];
}

/** mode 값. owner가 아니면 모두 customer */
export function parseLoginMode(value: SearchValue): LoginMode {
  return firstParam(value) === 'owner' ? 'owner' : 'customer';
}

/**
 * 주소의 next를 읽는다. 없거나 안전하지 않으면 null(그때는 토글로 고른 모드의 기본 주소로 돌아간다).
 * 빈 문자열은 안전한 주소가 될 수 없어서 "통과하지 못함" 표시로 쓴다.
 */
export function readNextParam(value: SearchValue): string | null {
  return safeNextPath(firstParam(value), '') || null;
}

/** 로그인 콜백이 돌려보내는 실패 이유(#47 3장, src/server/auth/paths.ts LoginError)와 화면 문구 */
export const LOGIN_ERROR_MESSAGES = {
  login_failed: '로그인하지 못했어요. 다시 시도해 주세요.',
  email_required:
    '이메일 제공에 동의해야 가입할 수 있어요. 다시 로그인하면서 이메일 제공에 동의해 주세요.',
} as const;

export type LoginErrorCode = keyof typeof LOGIN_ERROR_MESSAGES;

/** 주소의 error 값. 모르는 값이면 null(문구를 보여주지 않음) */
export function parseLoginError(value: SearchValue): LoginErrorCode | null {
  const raw = firstParam(value);
  return raw && Object.hasOwn(LOGIN_ERROR_MESSAGES, raw) ? (raw as LoginErrorCode) : null;
}
