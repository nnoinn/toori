// 네이버 프로필 응답을 Supabase가 읽는 표준 모양으로 바꾸기(W21). 기댓값은 naver/naver-openapi-guide ko/login/devguide 3.4.5의 응답 모양.

import { describe, expect, it } from 'vitest';

import { NAVER_EMAIL_VERIFIED, toStandardProfile } from './naver-profile';

const success = (response: Record<string, unknown>) => ({
  resultcode: '00',
  message: 'success',
  response,
});

describe('네이버 프로필 → 표준 모양', () => {
  it('이용자 식별자는 sub, 별명은 name과 nickname, 연락처 이메일은 email로 편다', () => {
    expect(
      toStandardProfile(
        success({
          id: 'abcdefgABCDEFG1234567',
          email: 'naveridlogin@naver.com',
          nickname: '네이버닉네임',
          name: '네이버',
          profile_image: 'https://phinf.pstatic.net/image.jpg',
        }),
      ),
    ).toEqual({
      sub: 'abcdefgABCDEFG1234567',
      email: 'naveridlogin@naver.com',
      email_verified: NAVER_EMAIL_VERIFIED,
      name: '네이버닉네임',
      nickname: '네이버닉네임',
      picture: 'https://phinf.pstatic.net/image.jpg',
    });
  });

  it('별명을 주지 않았으면 이름, 이메일을 주지 않았으면 email null·인증 아님', () => {
    expect(toStandardProfile(success({ id: 'id-1', name: '네이버' }))).toMatchObject({
      name: '네이버',
      nickname: null,
      email: null,
      email_verified: false,
    });
  });

  it('실패 응답·이용자 식별자 없음·이상한 값이면 null', () => {
    expect(toStandardProfile({ resultcode: '024', message: 'Authentication failed' })).toBeNull();
    expect(toStandardProfile(success({ email: 'a@b.c' }))).toBeNull();
    expect(toStandardProfile(success({ id: '   ' }))).toBeNull();
    expect(toStandardProfile(null)).toBeNull();
    expect(toStandardProfile('00')).toBeNull();
  });
});
