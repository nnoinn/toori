// 네이버 로그인(W21) 프로필을 Supabase가 읽는 표준 모양으로 바꾼다. 계산만 한다(화면·서버 어디서나 테스트할 수 있다).
// 네이버 프로필 API(https://openapi.naver.com/v1/nid/me)는 { resultcode, message, response: { id, email, nickname, ... } }처럼
// 감싸서 준다(naver/naver-openapi-guide ko/login/devguide 3.4.5). Supabase 커스텀 OAuth 제공자(custom:naver)는 사용자 정보를
// 표준 이름(sub·email·name)으로 읽어서, /api/auth/naver/userinfo가 이 함수로 펴서 돌려준다(기술 가이드 "응답 형식 맞추기").

/** Supabase에 돌려주는 사용자 정보. 네이버 별명은 고객 별명의 첫 값으로 쓴다(W21, 11/9) */
export type NaverStandardProfile = {
  /** 네이버 이용자 식별자(애플리케이션마다 다르다. 네이버 아이디가 아니다) */
  sub: string;
  email: string | null;
  email_verified: boolean;
  /** 네이버 별명. getSessionUser가 name을 처음 닉네임으로 쓴다 */
  name: string | null;
  nickname: string | null;
  picture: string | null;
};

/** 네이버가 성공으로 알려 주는 결과 코드 */
const NAVER_SUCCESS = '00';

/**
 * 네이버 연락처 이메일을 인증된 이메일로 볼지. 인증된 이메일이면 Supabase가 같은 이메일의 카카오·구글 로그인과 한 로그인 정보로 묶는다.
 * nnoinn 결정 전 임시값(true). 네이버가 연락처 이메일을 인증해서 받는지 확인한 뒤 정한다
 */
export const NAVER_EMAIL_VERIFIED = true;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** 네이버 프로필 응답을 표준 모양으로. 실패 응답이거나 이용자 식별자가 없으면 null */
export function toStandardProfile(body: unknown): NaverStandardProfile | null {
  if (typeof body !== 'object' || body === null) return null;
  const { resultcode, response } = body as { resultcode?: unknown; response?: unknown };
  if (resultcode !== NAVER_SUCCESS || typeof response !== 'object' || response === null) {
    return null;
  }
  const profile = response as Record<string, unknown>;
  const sub = text(profile.id);
  if (!sub) return null;
  const email = text(profile.email);
  const nickname = text(profile.nickname);
  return {
    sub,
    email,
    email_verified: email !== null && NAVER_EMAIL_VERIFIED,
    name: nickname ?? text(profile.name),
    nickname,
    picture: text(profile.profile_image),
  };
}
