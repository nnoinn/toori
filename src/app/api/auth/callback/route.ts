// 카카오·구글 로그인을 마치고 돌아오는 곳 (X-101, C-101, #47 3장).
// 1) 받은 code를 로그인 세션으로 바꾸고 2) 첫 로그인이면 profiles를 만들고 3) 고른 모드를 account_mode 쿠키에 저장한 뒤
// 4) 그 모드의 계정이 없으면 가입 화면(고객 /join, 원장님 /owner/join)으로, 있으면 보던 화면(next)으로 보낸다.

import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { getDb } from '@/db';
import { safeNextPath } from '@/lib/safe-next';
import {
  ACCOUNT_MODE_COOKIE,
  ACCOUNT_MODE_COOKIE_OPTIONS,
  parseAccountMode,
} from '@/server/auth/account-mode';
import { ensureProfile, loadAccount } from '@/server/auth/current-account';
import { afterLoginPath, DEFAULT_NEXT, loginPath } from '@/server/auth/paths';
import { createSupabaseServerClient } from '@/server/supabase/server';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = parseAccountMode(params.get('mode'));
  const next = safeNextPath(params.get('next'), DEFAULT_NEXT[mode]);
  const go = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin));

  // 로그인 화면에서 취소했거나 카카오·구글이 오류를 돌려주면 code가 없다
  const code = params.get('code');
  if (!code) return go(loginPath(mode, next, 'login_failed'));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    console.error('[auth] 로그인 세션 만들기 실패:', error?.name ?? 'no user');
    return go(loginPath(mode, next, 'login_failed'));
  }
  // 고객 계정과 원장님 계정을 이메일 하나로 묶으므로 이메일 제공 동의가 꼭 필요하다
  if (!data.user.email) {
    await supabase.auth.signOut({ scope: 'local' });
    return go(loginPath(mode, next, 'email_required'));
  }

  const db = getDb();
  await ensureProfile(db, data.user.id, data.user.email);
  (await cookies()).set(ACCOUNT_MODE_COOKIE, mode, ACCOUNT_MODE_COOKIE_OPTIONS);
  const account = await loadAccount(db, data.user.id, mode);
  return go(afterLoginPath(account, mode, next));
}
