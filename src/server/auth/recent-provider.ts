// 이 기기에서 가장 최근에 로그인한 간편 로그인 방식 (11/16 nnoinn, AUTH-15).
// 로그인 콜백이 로그인을 마치면 httpOnly 쿠키에 적고, 버튼이 있는 화면(첫 화면, 로그인 화면, 운영자 입구)이 그 버튼에
// "최근 로그인" 표시를 한다. 다른 방식으로 들어가 따로 계정이 생기는 일을 줄이려는 것이라 로그아웃해도 지우지 않는다.
// 기기(브라우저)마다 따로 기억하고 서버 DB에는 남기지 않는다.

import { cookies } from 'next/headers';

import { PROVIDER_ORDER, type ProviderKey } from '@/components/ui/provider-labels';

export const RECENT_PROVIDER_COOKIE = 'recent_login_provider';

/** 화면 스크립트가 읽지 못하게(httpOnly) 하고, 1년 동안 기억한다(account_mode 쿠키와 같다) */
export const RECENT_PROVIDER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 365 * 24 * 60 * 60,
} as const;

/** 쿠키·주소 값을 읽는다. 카카오·네이버·구글이 아니면 null */
export function parseRecentProvider(value: string | null | undefined): ProviderKey | null {
  return PROVIDER_ORDER.find((provider) => provider === value) ?? null;
}

/** 이 기기에서 가장 최근에 로그인한 방식. 없으면 null. 요청 안(<Suspense> 안)에서 부른다 */
export async function readRecentProvider(): Promise<ProviderKey | null> {
  return parseRecentProvider((await cookies()).get(RECENT_PROVIDER_COOKIE)?.value);
}
