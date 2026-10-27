import { type NextRequest, NextResponse } from 'next/server';

import { ACCOUNT_MODE_COOKIE, parseAccountMode } from '@/server/auth/account-mode';
import { decideProxy } from '@/server/auth/proxy-rules';
import { refreshSession } from '@/server/supabase/proxy-session';

// 화면 접근 1차 확인(로그인 세션과 account_mode 쿠키만 본다, #47 3장). Next.js 16의 proxy(예전 이름 middleware)다.
// 모든 화면에서 로그인 세션을 먼저 갱신한다. 그래야 Server Component가 만료되지 않은 세션을 읽는다.
// 2차 확인은 화면의 ensure…Page()와 서버 함수의 require…()가 DB를 보고 한다. proxy만 믿지 않는다.
export async function proxy(request: NextRequest) {
  const { response, userId } = await refreshSession(request);
  const decision = decideProxy({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    loggedIn: userId !== null,
    mode: parseAccountMode(request.cookies.get(ACCOUNT_MODE_COOKIE)?.value),
  });
  if (decision.type === 'next') return response;

  const blocked =
    decision.type === 'redirect'
      ? NextResponse.redirect(new URL(decision.to, request.url))
      : NextResponse.rewrite(new URL('/404', request.url), { status: 404 });
  // 갱신된 로그인 쿠키를 다른 곳으로 보낼 때도 잃지 않게 옮긴다
  for (const cookie of response.cookies.getAll()) blocked.cookies.set(cookie);
  return blocked;
}

export const config = {
  // 정적 파일·이미지·서비스 워커·매니페스트와 /api(로그인 콜백·웹훅은 각자 처리)는 빼고 모든 화면에서 돈다
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)',
  ],
};
