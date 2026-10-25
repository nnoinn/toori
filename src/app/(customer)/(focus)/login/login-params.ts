// 로그인 화면 주소 값 읽기 (J8, C-101). /login?mode=customer|owner&next=/... (#47 8장 답, #19 D21)
// next가 우리 사이트 안 주소인지는 공통 함수 safeNextPath(src/lib/safe-next.ts)로만 확인한다.

import { safeNextPath } from '@/lib/safe-next';

/** 로그인 화면 토글 값 */
export type LoginMode = 'customer' | 'owner';

/** next가 없거나 안전하지 않을 때 돌아갈 곳 */
export const DEFAULT_NEXT: Record<LoginMode, string> = {
  customer: '/',
  owner: '/owner',
};

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** mode 값. owner가 아니면 모두 customer */
export function parseLoginMode(value: SearchValue): LoginMode {
  return first(value) === 'owner' ? 'owner' : 'customer';
}

/**
 * 주소의 next를 읽는다. 없거나 안전하지 않으면 null(그때는 토글로 고른 모드의 기본 주소로 돌아간다).
 * 빈 문자열은 안전한 주소가 될 수 없어서 "통과하지 못함" 표시로 쓴다.
 */
export function readNextParam(value: SearchValue): string | null {
  return safeNextPath(first(value), '') || null;
}
