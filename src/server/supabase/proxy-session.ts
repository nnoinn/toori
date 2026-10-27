// proxy에서 로그인 세션을 갱신한다(@supabase/ssr의 미들웨어 방식).
// 화면이 그려지기 전에 만료된 로그인 토큰을 새로 받아 쿠키에 저장해 둬야, Server Component가 같은 세션을 읽는다.

import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

import { supabaseConfig } from './server';

/** 세션을 갱신하고, 갱신된 쿠키를 담은 응답과 로그인한 사람의 id(없으면 null)를 돌려준다 */
export async function refreshSession(
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null }> {
  let response = NextResponse.next({ request });
  const { url, key } = supabaseConfig();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        // 이번 요청의 화면도 새 토큰을 읽게 요청 쿠키를 바꾸고, 브라우저에 저장하게 응답 쿠키도 쓴다
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers ?? {}))
          response.headers.set(name, value);
      },
    },
  });
  // 토큰을 확인하면서 만료됐으면 갱신한다. 이 사이에 다른 코드를 넣지 않는다(@supabase/ssr 안내)
  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims.sub ?? null };
}
