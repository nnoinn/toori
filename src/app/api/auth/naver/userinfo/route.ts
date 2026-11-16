// 네이버 로그인(W21) 사용자 정보 다리. Supabase 커스텀 OAuth 제공자 custom:naver의 UserInfo URL로 등록한다
// (예: https://toori.kr/api/auth/naver/userinfo). Supabase가 네이버 접근 토큰을 Authorization: Bearer로 보내면,
// 그 토큰으로 네이버 프로필 API를 불러 표준 모양(sub·email·name)으로 펴서 돌려준다(naver-profile.ts).
// - 우리 비밀 값은 쓰지 않는다. 받은 토큰을 네이버에만 그대로 넘기고, 저장하거나 기록하지 않는다
// - 토큰이 없거나 네이버가 거절하면 401(Supabase가 로그인을 실패로 끝낸다)
// - /api는 팀 접속 코드 잠금(#303) 밖이라 Supabase 서버가 부를 수 있다

import { toStandardProfile } from '@/server/auth/naver-profile';

const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';

const unauthorized = () =>
  Response.json(
    { error: 'invalid_token' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^bearer\s+\S+/i.test(authorization)) return unauthorized();

  let body: unknown;
  try {
    const res = await fetch(NAVER_PROFILE_URL, {
      headers: { Authorization: authorization },
      cache: 'no-store',
    });
    if (!res.ok) return unauthorized();
    body = await res.json();
  } catch {
    console.error('[auth] 네이버 프로필을 불러오지 못했어요');
    return unauthorized();
  }

  const profile = toStandardProfile(body);
  if (!profile) return unauthorized();
  return Response.json(profile, { headers: { 'Cache-Control': 'no-store' } });
}
