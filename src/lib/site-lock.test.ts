// 팀 접속 코드 잠금 규칙(#303). 환경변수와 요청 없이 돈다.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  decideSiteLock,
  hasSiteAccess,
  isSiteLockPath,
  isTeamCode,
  lockScreenPath,
  normalizeTeamCode,
  siteAccessToken,
  siteEntryNextPath,
  siteLockCode,
} from './site-lock';

// 테스트용 코드. 실제 팀 접속 코드는 Vercel에만 있다
const CODE = 'green wind blue river';

describe('코드 정리와 잠금 켜기', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('띄어쓰기 개수·앞뒤 공백·영문 대소문자·한글 조합 방식이 달라도 같은 코드로 본다', () => {
    expect(normalizeTeamCode('  Green   WIND\tblue river ')).toBe(CODE);
    // 맥에서 자모가 나뉘어 들어온 '투리'(NFD)도 같은 글자로 본다
    expect(normalizeTeamCode('투리'.normalize('NFD'))).toBe('투리');
  });

  it('SITE_LOCK_CODE가 없거나 공백뿐이면 잠그지 않는다', () => {
    vi.stubEnv('SITE_LOCK_CODE', '');
    expect(siteLockCode()).toBeNull();
    vi.stubEnv('SITE_LOCK_CODE', '   ');
    expect(siteLockCode()).toBeNull();
  });

  it('SITE_LOCK_CODE가 있으면 정리한 코드로 잠근다', () => {
    vi.stubEnv('SITE_LOCK_CODE', ' Green Wind  Blue River ');
    expect(siteLockCode()).toBe(CODE);
  });
});

describe('입장 쿠키 값', () => {
  it('코드가 같으면 늘 같은 값이고, 코드 글자가 그대로 들어 있지 않다', () => {
    const token = siteAccessToken(CODE);
    expect(siteAccessToken(CODE)).toBe(token);
    expect(siteAccessToken('GREEN  wind blue river')).toBe(token);
    expect(token).not.toContain('green');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('코드를 바꾸면 전에 받은 쿠키는 통하지 않는다', () => {
    const oldCookie = siteAccessToken(CODE);
    expect(hasSiteAccess(oldCookie, CODE)).toBe(true);
    expect(hasSiteAccess(oldCookie, 'new code for team')).toBe(false);
  });

  it('쿠키가 없거나 모양이 다르면 입장하지 않은 것으로 본다', () => {
    expect(hasSiteAccess(undefined, CODE)).toBe(false);
    expect(hasSiteAccess('', CODE)).toBe(false);
    expect(hasSiteAccess(CODE, CODE)).toBe(false);
    expect(hasSiteAccess(`${siteAccessToken(CODE)}x`, CODE)).toBe(false);
  });

  it('넣은 코드가 팀 접속 코드와 같은지 정리한 값으로 비교한다', () => {
    expect(isTeamCode(' GREEN wind  blue river', CODE)).toBe(true);
    expect(isTeamCode('green wind blue', CODE)).toBe(false);
    expect(isTeamCode('', CODE)).toBe(false);
  });
});

describe('잠금 화면 주소', () => {
  it('잠금 화면과 그 아래 주소만 잠금 화면으로 본다', () => {
    expect(isSiteLockPath('/coming-soon')).toBe(true);
    expect(isSiteLockPath('/coming-soon/x')).toBe(true);
    expect(isSiteLockPath('/coming-soonx')).toBe(false);
    expect(isSiteLockPath('/')).toBe(false);
  });

  it('원래 가려던 주소를 next로 붙이고, 첫 화면이면 붙이지 않는다', () => {
    expect(lockScreenPath('/', '')).toBe('/coming-soon');
    expect(lockScreenPath('/home/list', '')).toBe('/coming-soon?next=%2Fhome%2Flist');
    expect(lockScreenPath('/slots/abc', '?from=map&x=1')).toBe(
      '/coming-soon?next=%2Fslots%2Fabc%3Ffrom%3Dmap%26x%3D1',
    );
  });

  it('화면 이동 중 요청의 내부 값(_rsc)은 돌아갈 주소에 남기지 않는다', () => {
    expect(lockScreenPath('/owner', '?_rsc=1x2y')).toBe('/coming-soon?next=%2Fowner');
    expect(lockScreenPath('/', '?_rsc=1x2y')).toBe('/coming-soon');
  });

  it('코드를 넣은 뒤에는 우리 사이트 안 주소로만 돌아가고, 잠금 화면 자체면 첫 화면으로 간다', () => {
    expect(siteEntryNextPath('/slots/abc?from=map')).toBe('/slots/abc?from=map');
    expect(siteEntryNextPath(null)).toBe('/');
    expect(siteEntryNextPath('//evil.example')).toBe('/');
    expect(siteEntryNextPath('https://evil.example/x')).toBe('/');
    expect(siteEntryNextPath('/coming-soon?next=%2Fhome')).toBe('/');
  });
});

describe('proxy 잠금 규칙', () => {
  const entered = siteAccessToken(CODE);
  const visit = (
    pathname: string,
    {
      code = CODE as string | null,
      cookie = undefined as string | undefined,
      method = 'GET',
      search = '',
    } = {},
  ) => decideSiteLock({ code, accessCookie: cookie, method, pathname, search });

  it('잠금이 꺼져 있으면 모든 화면이 지금처럼 진행한다', () => {
    expect(visit('/', { code: null })).toEqual({ type: 'pass' });
    expect(visit('/owner', { code: null, method: 'POST' })).toEqual({ type: 'pass' });
  });

  it('입장하지 않았으면 화면 요청을 잠금 화면으로 보내고, 보던 주소를 붙인다', () => {
    expect(visit('/')).toEqual({ type: 'redirect', to: '/coming-soon' });
    expect(visit('/reservations/abc', { search: '?tab=1' })).toEqual({
      type: 'redirect',
      to: '/coming-soon?next=%2Freservations%2Fabc%3Ftab%3D1',
    });
    // 서버 함수(POST)도 막는다
    expect(visit('/owner/slots', { method: 'POST' })).toEqual({
      type: 'redirect',
      to: '/coming-soon?next=%2Fowner%2Fslots',
    });
    // 다른 코드로 받은 쿠키는 통하지 않는다
    expect(visit('/', { cookie: siteAccessToken('old code') })).toEqual({
      type: 'redirect',
      to: '/coming-soon',
    });
  });

  it('입장한 팀원은 모든 화면이 지금처럼 진행한다', () => {
    expect(visit('/', { cookie: entered })).toEqual({ type: 'pass' });
    expect(visit('/admin', { cookie: entered, method: 'POST' })).toEqual({ type: 'pass' });
  });

  it('입장하지 않은 사람에게는 잠금 화면을 보여주고, 코드 입력(POST)도 받는다', () => {
    expect(visit('/coming-soon', { search: '?next=%2Fhome' })).toEqual({ type: 'lock_screen' });
    expect(visit('/coming-soon', { method: 'POST' })).toEqual({ type: 'lock_screen' });
  });

  it('잠금이 꺼졌거나 이미 입장했으면 잠금 화면 대신 가려던 화면으로 보낸다', () => {
    expect(visit('/coming-soon', { code: null, search: '?next=%2Fhome' })).toEqual({
      type: 'redirect',
      to: '/home',
    });
    expect(visit('/coming-soon', { cookie: entered })).toEqual({ type: 'redirect', to: '/' });
    expect(visit('/coming-soon', { cookie: entered, search: '?next=%2F%2Fevil.example' })).toEqual({
      type: 'redirect',
      to: '/',
    });
  });

  it('이미 입장했어도 잠금 화면의 코드 입력(POST)은 서버 함수가 처리하게 통과시킨다', () => {
    expect(visit('/coming-soon', { cookie: entered, method: 'POST' })).toEqual({ type: 'pass' });
  });
});
