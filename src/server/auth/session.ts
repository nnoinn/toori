'use server';

// 로그인 시작·로그아웃·계정 전환 (X-101, C-101, #47 3장). 로그인 화면(정찬형)과 내 정보 화면에서 부른다.
// 카카오·구글 로그인을 마치고 돌아오는 처리는 src/app/api/auth/callback/route.ts가 한다.

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { getDb } from '@/db';
import { fail, ok, type Result } from '@/lib/result';
import { safeNextPath } from '@/lib/safe-next';
import { createSupabaseServerClient } from '@/server/supabase/server';

import {
  ACCOUNT_MODE_COOKIE,
  ACCOUNT_MODE_COOKIE_OPTIONS,
  ACCOUNT_MODES,
  type AccountMode,
  hasAccountFor,
} from './account-mode';
import { MARKETING_NOTICE_COOKIE } from './consent-notice';
import { getSessionUserId, loadAccount } from './current-account';
import { DEFAULT_NEXT } from './paths';
import { AUTH_ERRORS } from './require';

const PROVIDERS = ['kakao', 'google'] as const;

const signInSchema = z.object({
  provider: z.enum(PROVIDERS),
  mode: z.enum(ACCOUNT_MODES),
  next: z.string().optional(),
});

/**
 * 카카오·구글 로그인 화면으로 보낸다. 로그인을 마치면 /api/auth/callback으로 돌아와서 mode·next대로 처리한다.
 * 성공하면 돌아오지 않고(redirect), 시작하지 못했을 때만 실패 결과를 돌려준다
 */
export async function signInWithProvider(input: {
  provider: (typeof PROVIDERS)[number];
  mode: AccountMode;
  next?: string;
}): Promise<Result<never>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '로그인 방법을 다시 골라 주세요');
  const { provider, mode } = parsed.data;
  const next = safeNextPath(parsed.data.next, DEFAULT_NEXT[mode]);

  // 돌아올 주소는 지금 사이트 주소로 만든다. Supabase가 등록된 주소(로컬·운영·미리보기)만 받아 준다
  const origin = (await headers()).get('origin');
  if (!origin) return fail('LOGIN_UNAVAILABLE', LOGIN_UNAVAILABLE_MESSAGE);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/api/auth/callback?${new URLSearchParams({ mode, next })}` },
  });
  if (error || !data.url) {
    console.error('[auth] 간편 로그인 시작 실패:', error?.name ?? 'no url');
    return fail('LOGIN_UNAVAILABLE', LOGIN_UNAVAILABLE_MESSAGE);
  }
  redirect(data.url);
}

const LOGIN_UNAVAILABLE_MESSAGE = '로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

/** 로그아웃. 이 브라우저의 로그인만 끝낸다(다른 기기는 그대로). 화면은 성공하면 홈으로 보낸다 */
export async function signOut(): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  const store = await cookies();
  store.delete(ACCOUNT_MODE_COOKIE);
  store.delete(MARKETING_NOTICE_COOKIE);
  if (error) {
    console.error('[auth] 로그아웃 실패:', error.name);
    return fail('SIGN_OUT_FAILED', '로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요');
  }
  return ok(null);
}

/**
 * 고객 계정과 원장님 계정 사이를 바꾼다(WRONG_MODE일 때 '계정 바꾸기' 버튼 등).
 * hasAccount가 false면 화면이 가입 화면(고객 /join, 원장님 /owner/join)으로 보낸다
 */
export async function switchAccountMode(
  mode: AccountMode,
): Promise<Result<{ mode: AccountMode; hasAccount: boolean }>> {
  const parsed = z.enum(ACCOUNT_MODES).safeParse(mode);
  if (!parsed.success) return fail('INVALID_INPUT', '바꿀 계정을 다시 골라 주세요');
  const userId = await getSessionUserId();
  if (!userId) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);

  (await cookies()).set(ACCOUNT_MODE_COOKIE, parsed.data, ACCOUNT_MODE_COOKIE_OPTIONS);
  const account = await loadAccount(getDb(), userId, parsed.data);
  return ok({ mode: parsed.data, hasAccount: hasAccountFor(account, parsed.data) });
}
