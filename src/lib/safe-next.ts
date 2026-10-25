// 로그인 뒤 돌아갈 주소(next) 확인 (#19 D21, #47 3장). 화면·서버 어디서나 쓴다.
// 로그인 화면, 로그인 콜백, proxy, 약관 화면이 모두 이 함수 하나로 확인해서 규칙이 어긋나지 않게 한다.
// 우리 사이트 안 주소만 통과시킨다. 다른 사이트로 보내는 주소(오픈 리다이렉트)는 fallback으로 바꾼다.

// 주소를 해석할 때만 쓰는 가짜 기준 주소. 결과가 이 출처를 벗어나면 다른 사이트로 가는 주소다
const BASE = 'https://toori.invalid';
const MAX_LENGTH = 2048;

/**
 * next가 우리 사이트 안 주소면 정리해서 돌려주고, 아니면 fallback을 돌려준다.
 * 예: safeNextPath('/slots/abc', '/') → '/slots/abc', safeNextPath('//evil.com', '/') → '/'
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (typeof next !== 'string' || next.length === 0 || next.length > MAX_LENGTH) return fallback;
  // '/'로 시작해야 한다. '//'로 시작하면 브라우저가 다른 사이트 주소로 읽는다
  if (!next.startsWith('/') || next.startsWith('//')) return fallback;
  // 브라우저는 주소 안의 탭·줄바꿈을 지우고 역슬래시를 /로 읽는다('/\evil.com' → '//evil.com'). 이런 글자는 받지 않는다
  if (/[\u0000-\u001F\u007F\\]/.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  // 점(.·..)을 정리한 결과가 '//'로 시작할 수 있다('/..//evil.com' → '//evil.com', #89). 결과도 한 번 더 확인한다
  const path = `${url.pathname}${url.search}${url.hash}`;
  if (path.startsWith('//')) return fallback;
  return path;
}
