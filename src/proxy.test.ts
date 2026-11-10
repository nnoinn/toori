// proxy (#47 3장, #303): 팀 접속 코드 잠금이 로그인 세션 갱신보다 먼저 도는지, 잠금 중 검색 차단 머리말이 붙는지.
// 로그인 세션 갱신(Supabase)은 가짜로 바꾼다.

import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { siteAccessToken } from '@/lib/site-lock';

import { proxy } from './proxy';

const refreshSession = vi.hoisted(() => vi.fn());
vi.mock('@/server/supabase/proxy-session', () => ({ refreshSession }));

// 테스트용 코드. 실제 팀 접속 코드는 Vercel에만 있다
const CODE = 'green wind blue river';
const ORIGIN = 'https://toori.kr';

function visit(
  path: string,
  { cookie, method = 'GET' }: { cookie?: string; method?: string } = {},
) {
  return proxy(
    new NextRequest(new URL(path, ORIGIN), {
      method,
      headers: cookie ? { cookie: `site_access=${cookie}` } : {},
    }),
  );
}

beforeEach(() => {
  // 로그인하지 않은 사람으로 세션 갱신을 마친 것처럼 한다
  refreshSession.mockImplementation(async (request: NextRequest) => ({
    response: NextResponse.next({ request }),
    userId: null,
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  refreshSession.mockReset();
});

describe('잠금이 꺼져 있을 때(SITE_LOCK_CODE 없음, 로컬)', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_LOCK_CODE', '');
  });

  it('지금처럼 세션을 갱신하고 화면을 보여주며, 검색 차단 머리말을 붙이지 않는다', async () => {
    const res = await visit('/home');
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-robots-tag')).toBeNull();
  });

  it('잠금 화면 주소로 들어오면 가려던 화면으로 보낸다', async () => {
    const res = await visit('/coming-soon?next=%2Fhome');
    expect(res.headers.get('location')).toBe(`${ORIGIN}/home`);
  });
});

describe('잠금이 켜져 있을 때', () => {
  beforeEach(() => {
    vi.stubEnv('SITE_LOCK_CODE', CODE);
  });

  it('입장 쿠키가 없으면 세션을 갱신하지 않고 잠금 화면으로 보낸다', async () => {
    const res = await visit('/slots/abc?from=map');
    expect(refreshSession).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      `${ORIGIN}/coming-soon?next=%2Fslots%2Fabc%3Ffrom%3Dmap`,
    );
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('잠금 화면은 세션 갱신 없이 그대로 보여준다(코드 입력 POST 포함)', async () => {
    for (const method of ['GET', 'POST']) {
      const res = await visit('/coming-soon?next=%2Fhome', { method });
      expect(res.headers.get('location')).toBeNull();
      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('입장한 팀원은 지금처럼 세션을 갱신하고 화면을 본다', async () => {
    const res = await visit('/home', { cookie: siteAccessToken(CODE) });
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('입장한 뒤에도 원장님·운영자 화면 1차 확인은 그대로다', async () => {
    const cookie = siteAccessToken(CODE);
    const owner = await visit('/owner', { cookie });
    expect(owner.headers.get('location')).toBe(`${ORIGIN}/login?mode=owner&next=%2Fowner`);
    expect(owner.headers.get('x-robots-tag')).toBe('noindex, nofollow');

    const admin = await visit('/admin', { cookie });
    expect(admin.status).toBe(404);
    expect(admin.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('코드를 바꾸면 전에 받은 쿠키로는 들어오지 못한다', async () => {
    const res = await visit('/home', { cookie: siteAccessToken('old team code') });
    expect(refreshSession).not.toHaveBeenCalled();
    expect(res.headers.get('location')).toBe(`${ORIGIN}/coming-soon?next=%2Fhome`);
  });
});
