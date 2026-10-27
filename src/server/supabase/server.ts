// 서버용 Supabase 연결 (X-101, #13 Q3). 로그인(Auth)에만 쓴다. 데이터는 Drizzle(getDb)로만 읽고 쓴다(기술 가이드 2장).
// 로그인 정보는 쿠키에 있어서 요청마다 새로 만든다.

import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** .env.local의 Supabase 주소와 공개 키. 없으면 바로 알 수 있게 에러를 낸다 */
export function supabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL·NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY가 없어요. .env.local을 확인해 주세요.',
    );
  }
  return { url, key };
}

/**
 * Server Component·Server Action·Route Handler에서 쓰는 Supabase 연결.
 * Server Component에서는 쿠키를 쓸 수 없어서 세션 갱신 결과를 저장하지 못한다. 그래서 proxy가 화면마다 먼저 갱신한다
 */
export async function createSupabaseServerClient() {
  const store = await cookies();
  const { url, key } = supabaseConfig();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, options);
        } catch {
          // Server Component 렌더링 중이면 쿠키를 쓸 수 없다(proxy가 이미 갱신해 둔다)
        }
      },
    },
  });
}
