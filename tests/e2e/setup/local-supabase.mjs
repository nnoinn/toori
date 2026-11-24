// 브라우저 자동 테스트(E2E, #592)가 쓰는 로컬 Supabase 주소·키와 앱 환경변수.
// 안전장치: E2E는 로컬 Supabase(127.0.0.1)에서만 돈다. 주소가 내 컴퓨터가 아니면(공용 개발 DB 등) 바로 멈춘다.
// playwright.config.ts(앱 서버 환경), prepare-db.mjs(마이그레이션·시드), github-env.mjs(GitHub 검사)가 같이 쓴다.
// Playwright가 설정 파일과 함께 이 파일을 CommonJS로 바꿔 읽으므로 import.meta를 쓰지 않는다(명령은 github-env.mjs)

import { execFileSync } from 'node:child_process';

/** GitHub 검사(supabase/setup-cli)와 내 컴퓨터(npx)가 같은 버전의 Supabase CLI를 쓴다 */
export const SUPABASE_CLI_VERSION = '2.122.1';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** 주소가 내 컴퓨터(또는 GitHub 검사 안)인지 */
export function isLocalUrl(url) {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Supabase 주소와 DB 주소가 모두 내 컴퓨터가 아니면 멈춘다 */
export function assertLocalSupabase({ apiUrl, dbUrl }) {
  const notLocal = [
    ['Supabase 주소', apiUrl],
    ['DB 주소', dbUrl],
  ].filter(([, url]) => !isLocalUrl(url));
  if (notLocal.length > 0) {
    // 주소 자체는 찍지 않는다(개발 DB 주소가 기록에 남지 않게)
    throw new Error(
      `E2E는 로컬 Supabase(127.0.0.1)에서만 돌아요. ${notLocal.map(([name]) => name).join('·')}가 내 컴퓨터 주소가 아니라서 멈췄어요. ` +
        '공용 개발 DB에는 E2E를 돌리지 않아요.',
    );
  }
}

/** `supabase status -o env` 출력(KEY="value" 줄)을 읽는다 */
export function parseStatusEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^"(.*)"$/, '$1');
  }
  return values;
}

function runStatus() {
  // GitHub 검사는 setup-cli가 설치한 supabase, 내 컴퓨터는 npx로 같은 버전을 쓴다(package.json에 넣지 않는다, #592)
  const [command, args] = process.env.CI
    ? ['supabase', ['status', '-o', 'env']]
    : ['npx', ['-y', `supabase@${SUPABASE_CLI_VERSION}`, 'status', '-o', 'env']];
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
  } catch (error) {
    throw new Error(
      '로컬 Supabase가 켜져 있지 않아요. Docker Desktop을 켜고 ' +
        `npx supabase@${SUPABASE_CLI_VERSION} start를 먼저 실행해 주세요(tests/e2e/README.md).`,
      { cause: error },
    );
  }
}

/**
 * 로컬 Supabase의 주소와 키. E2E_SUPABASE_URL·E2E_DATABASE_URL·E2E_SUPABASE_ANON_KEY·E2E_SUPABASE_SERVICE_ROLE_KEY가
 * 모두 있으면 그 값을, 아니면 `supabase status`를 읽는다. 어느 쪽이든 내 컴퓨터 주소가 아니면 멈춘다
 * @param {Record<string, string | undefined>} [env]
 * @param {() => string} [readStatus] supabase status -o env 출력(테스트는 가짜를 넘긴다)
 */
export function readLocalSupabase(env = process.env, readStatus = runStatus) {
  const given = {
    apiUrl: env.E2E_SUPABASE_URL,
    dbUrl: env.E2E_DATABASE_URL,
    anonKey: env.E2E_SUPABASE_ANON_KEY,
    serviceRoleKey: env.E2E_SUPABASE_SERVICE_ROLE_KEY,
  };
  let values = given;
  if (!Object.values(given).every(Boolean)) {
    const status = parseStatusEnv(readStatus());
    values = {
      apiUrl: status.API_URL,
      dbUrl: status.DB_URL,
      anonKey: status.ANON_KEY ?? status.PUBLISHABLE_KEY,
      serviceRoleKey: status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,
    };
  }
  assertLocalSupabase(values);
  if (!values.anonKey || !values.serviceRoleKey) {
    throw new Error('로컬 Supabase의 키를 찾지 못했어요. supabase status 출력을 확인해 주세요.');
  }
  return values;
}

/**
 * E2E 전용 가짜 값(진짜 키가 아니다. 로컬 DB에만 쓰고 버린다). GitHub secret은 쓰지 않는다(#592, 레포 공개).
 * 같은 사람 표시 키 모양은 vitest.config.mts와 같다
 */
const FAKE_SECRETS = {
  ACCOUNT_IDENTITY_KEY: '0123456789abcdef'.repeat(4),
  PAYOUT_ACCOUNT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  CRON_SECRET: 'e2e-cron-secret',
};

/**
 * 빈 값으로 덮는 환경변수. 내 컴퓨터의 .env.local(공용 개발 DB·외부 서비스 키, 로컬 스위치)이 E2E 앱 서버에 섞이지 않게 한다.
 * Next.js는 이미 있는 환경변수를 .env 파일로 덮지 않는다(빈 값도 있는 것으로 본다)
 */
const BLANK_KEYS = [
  'NEXT_PUBLIC_KAKAO_MAP_JS_KEY',
  'KAKAO_REST_API_KEY',
  'NEXT_PUBLIC_PORTONE_STORE_ID',
  'NEXT_PUBLIC_PORTONE_CHANNEL_KEY',
  'PORTONE_API_SECRET',
  'PORTONE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'SITE_LOCK_CODE',
  'NTS_SERVICE_KEY',
  'DEV_FAKE_WITHDRAWAL',
  'DEV_FAKE_WITHDRAWAL_FAILURE',
  'DEV_FAKE_SLOT_WINDOWS_FAILURE',
  'DEV_FAKE_PAYMENT_FAILURE',
  'DEV_FAKE_DISPUTE_FAILURE',
  'DEV_FAKE_AGREED_CANCEL_FAILURE',
];

/** E2E 앱 서버(빌드·실행)에 넘기는 환경변수 */
export function e2eAppEnv(supabase) {
  assertLocalSupabase(supabase);
  return {
    NEXT_PUBLIC_SUPABASE_URL: supabase.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.anonKey,
    SUPABASE_SECRET_KEY: supabase.serviceRoleKey,
    DATABASE_URL: supabase.dbUrl,
    ...FAKE_SECRETS,
    ...Object.fromEntries(BLANK_KEYS.map((key) => [key, ''])),
  };
}
