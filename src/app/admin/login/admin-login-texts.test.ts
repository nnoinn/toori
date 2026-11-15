// 운영자 입구 주소 값 읽기와 문구 (#372 1장).

import { describe, expect, it } from 'vitest';

import { ADMIN_LOGIN_ERROR_MESSAGES, toAdminLoginError, toAdminNext } from './admin-login-texts';

describe('운영자 입구', () => {
  it('로그인 뒤에는 운영자 화면(/admin…)으로만 돌아가고, 다른 화면·다른 사이트·빈 값이면 운영자 첫 화면', () => {
    expect(toAdminNext('/admin/disputes?status=open')).toBe('/admin/disputes?status=open');
    expect(toAdminNext('/admin')).toBe('/admin');
    expect(toAdminNext('/owner')).toBe('/admin');
    expect(toAdminNext('/administrator')).toBe('/admin');
    expect(toAdminNext('//evil.example')).toBe('/admin');
    expect(toAdminNext(undefined)).toBe('/admin');
  });

  it('아는 실패 이유만 문구로 보이고(운영자 아님 포함), 모르는 값·객체 속성 이름은 보이지 않는다', () => {
    expect(toAdminLoginError('not_admin')).toBe('not_admin');
    expect(ADMIN_LOGIN_ERROR_MESSAGES.not_admin).toContain('운영자 계정이 아니에요');
    expect(toAdminLoginError('login_failed')).toBe('login_failed');
    expect(toAdminLoginError('constructor')).toBeNull();
    expect(toAdminLoginError('x')).toBeNull();
    expect(toAdminLoginError(undefined)).toBeNull();
  });
});
