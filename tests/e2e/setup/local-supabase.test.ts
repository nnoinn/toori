import { describe, expect, it } from 'vitest';

import { FAKE_PORTONE } from './fake-portone.mjs';
import { e2eAppEnv, isLocalUrl, parseStatusEnv, readLocalSupabase } from './local-supabase.mjs';

// E2E 안전장치(#592): 브라우저 자동 테스트는 로컬 Supabase(127.0.0.1)에서만 돌고, 공용 개발 DB 주소면 바로 멈춘다.
// 주소는 가짜 예시다(진짜 개발 DB 주소를 테스트에 적지 않는다)
const LOCAL = {
  E2E_SUPABASE_URL: 'http://127.0.0.1:54321',
  E2E_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  E2E_SUPABASE_ANON_KEY: 'local-anon',
  E2E_SUPABASE_SERVICE_ROLE_KEY: 'local-service',
};
const REMOTE_API = 'https://abcdefghijklmnop.supabase.co';
const REMOTE_DB =
  'postgresql://postgres.abcdefghijklmnop:pw@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres';
const noStatus = () => {
  throw new Error('supabase status를 부르면 안 돼요');
};

describe('E2E 안전장치: 로컬 주소만', () => {
  it('내 컴퓨터 주소(localhost·127.0.0.1·::1)만 로컬로 본다', () => {
    expect(isLocalUrl('http://127.0.0.1:54321')).toBe(true);
    expect(isLocalUrl('http://localhost:54321')).toBe(true);
    expect(isLocalUrl('http://[::1]:54321')).toBe(true);
    expect(isLocalUrl(LOCAL.E2E_DATABASE_URL)).toBe(true);
    expect(isLocalUrl(REMOTE_API)).toBe(false);
    expect(isLocalUrl(REMOTE_DB)).toBe(false);
    expect(isLocalUrl('http://127.0.0.1.example.com')).toBe(false);
    expect(isLocalUrl('')).toBe(false);
    expect(isLocalUrl(undefined)).toBe(false);
  });

  it('E2E_* 값이 모두 로컬이면 그대로 쓰고 supabase status는 부르지 않는다', () => {
    expect(readLocalSupabase(LOCAL, noStatus)).toEqual({
      apiUrl: LOCAL.E2E_SUPABASE_URL,
      dbUrl: LOCAL.E2E_DATABASE_URL,
      anonKey: 'local-anon',
      serviceRoleKey: 'local-service',
    });
  });

  it('Supabase 주소나 DB 주소 하나라도 내 컴퓨터가 아니면 멈춘다(공용 개발 DB)', () => {
    expect(() => readLocalSupabase({ ...LOCAL, E2E_SUPABASE_URL: REMOTE_API }, noStatus)).toThrow(
      /E2E는 로컬 Supabase\(127\.0\.0\.1\)에서만 돌아요. Supabase 주소가/,
    );
    expect(() => readLocalSupabase({ ...LOCAL, E2E_DATABASE_URL: REMOTE_DB }, noStatus)).toThrow(
      /E2E는 로컬 Supabase\(127\.0\.0\.1\)에서만 돌아요. DB 주소가/,
    );
  });

  it('멈출 때 주소 자체는 오류 문구에 남기지 않는다', () => {
    expect(() => readLocalSupabase({ ...LOCAL, E2E_DATABASE_URL: REMOTE_DB }, noStatus)).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('supabase.com') }),
    );
  });

  it('E2E_* 값이 없으면 supabase status 값을 읽고, 그 주소도 로컬이 아니면 멈춘다', () => {
    const status = [
      'API_URL="http://127.0.0.1:54321"',
      'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
      'ANON_KEY="status-anon"',
      'SERVICE_ROLE_KEY="status-service"',
    ].join('\n');
    const fromStatus = {
      apiUrl: 'http://127.0.0.1:54321',
      dbUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      anonKey: 'status-anon',
      serviceRoleKey: 'status-service',
    };
    expect(readLocalSupabase({}, () => status)).toEqual(fromStatus);
    // 일부만 있어도 status 값을 쓴다(값을 섞지 않는다)
    expect(readLocalSupabase({ E2E_SUPABASE_ANON_KEY: 'partial' }, () => status)).toEqual(
      fromStatus,
    );
    expect(() =>
      readLocalSupabase({}, () => `API_URL="${REMOTE_API}"\nDB_URL="${REMOTE_DB}"`),
    ).toThrow(/로컬 Supabase\(127\.0\.0\.1\)에서만/);
  });

  it('supabase status 출력: 따옴표를 벗기고, KEY=값 모양이 아닌 줄은 건너뛴다', () => {
    expect(
      parseStatusEnv(
        'Stopped services: [supabase_studio]\r\nAPI_URL="http://127.0.0.1:54321"\nJWT_SECRET=abc=def\n',
      ),
    ).toEqual({ API_URL: 'http://127.0.0.1:54321', JWT_SECRET: 'abc=def' });
  });
});

describe('E2E 앱 서버 환경변수', () => {
  const env = e2eAppEnv({
    apiUrl: LOCAL.E2E_SUPABASE_URL,
    dbUrl: LOCAL.E2E_DATABASE_URL,
    anonKey: 'local-anon',
    serviceRoleKey: 'local-service',
  });

  it('Supabase·DB는 로컬 값으로 덮는다(.env.local의 공용 개발 DB가 섞이지 않게)', () => {
    expect(env).toMatchObject({
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-anon',
      SUPABASE_SECRET_KEY: 'local-service',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    });
  });

  it('외부 서비스 키·팀 접속 코드·로컬 스위치는 빈 값으로 덮는다', () => {
    for (const key of [
      'PORTONE_WEBHOOK_SECRET',
      'KAKAO_REST_API_KEY',
      'VAPID_PRIVATE_KEY',
      'SITE_LOCK_CODE',
      'NTS_SERVICE_KEY',
      'DEV_FAKE_WITHDRAWAL',
      'DEV_FAKE_PAYMENT_FAILURE',
    ]) {
      expect(env[key as keyof typeof env], key).toBe('');
    }
  });

  it('결제는 내 컴퓨터의 가짜 포트원 서버로 가고, 포트원 키는 E2E 가짜 값이다(#592 2차)', () => {
    expect(env).toMatchObject({
      PORTONE_API_URL: 'http://127.0.0.1:4010',
      NEXT_PUBLIC_PORTONE_STORE_ID: FAKE_PORTONE.storeId,
      NEXT_PUBLIC_PORTONE_CHANNEL_KEY: FAKE_PORTONE.channelKey,
      PORTONE_API_SECRET: FAKE_PORTONE.secret,
    });
    expect(isLocalUrl(env.PORTONE_API_URL)).toBe(true);
  });

  it('같은 사람 표시 키는 E2E 전용 가짜 값(16진수 64자리)', () => {
    expect(env.ACCOUNT_IDENTITY_KEY).toMatch(/^[0-9a-f]{64}$/);
  });

  it('로컬이 아닌 주소로는 만들지 않는다', () => {
    expect(() =>
      e2eAppEnv({ apiUrl: REMOTE_API, dbUrl: REMOTE_DB, anonKey: 'x', serviceRoleKey: 'y' }),
    ).toThrow(/로컬 Supabase/);
  });
});
