// 로그인 화면 주소 값 읽기 (J8, C-101). /login?mode=customer|owner&next=/... (#47 8장 답, 10/24)
// 화면과 서버 어디서나 쓴다. 강규민님 로그인 콜백도 같은 규칙으로 next를 확인한다.

/** 로그인 화면 토글 값. #47의 AccountMode가 코드에 들어오면 그 타입으로 바꾼다 */
export type LoginMode = 'customer' | 'owner';

export const DEFAULT_NEXT: Record<LoginMode, string> = {
  customer: '/',
  owner: '/owner',
};

// next를 이 가짜 주소 기준으로 풀어서, 우리 사이트 밖으로 나가는지 본다
const BASE = 'https://toori.invalid';

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** mode 값. owner가 아니면 모두 customer */
export function parseLoginMode(value: SearchValue): LoginMode {
  return first(value) === 'owner' ? 'owner' : 'customer';
}

/**
 * 로그인 뒤 돌아갈 주소. 우리 사이트 안 주소("/"로 시작, "//"나 "/\"로 시작하지 않음)만 받고,
 * 그 밖이면 null(오픈 리다이렉트 방지). 돌려줄 때는 경로·검색값·#만 남긴다.
 */
export function safeNextPath(value: SearchValue): string | null {
  const raw = first(value);
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  // 줄바꿈·탭 같은 제어 문자는 브라우저가 지우면서 주소가 바뀔 수 있어서 거절한다
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  try {
    const url = new URL(raw, BASE);
    if (url.origin !== BASE) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** next가 없거나 안전하지 않으면 그 모드의 기본 주소 */
export function resolveNextPath(value: SearchValue, mode: LoginMode): string {
  return safeNextPath(value) ?? DEFAULT_NEXT[mode];
}
