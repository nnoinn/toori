import { defineConfig, devices } from '@playwright/test';

import { e2eAppEnv, readLocalSupabase } from './tests/e2e/setup/local-supabase.mjs';

// 브라우저 자동 테스트(E2E, 회귀 테스트 ③, #592). 로봇이 실제 브라우저로 고객 흐름을 눌러 본다.
// 로컬 Supabase(127.0.0.1)와 운영과 같은 빌드(next build → next start)에서만 돈다. 공용 개발 DB 주소면 시작하지 않는다.
// 실행: npm run test:e2e(먼저 npx supabase start). 자세한 것은 tests/e2e/README.md
// Vitest(*.test.ts)와 겹치지 않게 테스트 파일은 tests/e2e/*.spec.ts다

const supabase = readLocalSupabase();
// 테스트 코드(시드 계정 로그인, 매물 고르기)가 같은 로컬 Supabase를 쓰게 넘긴다. 테스트 작업자는 이 값을 물려받는다
process.env.E2E_SUPABASE_URL = supabase.apiUrl;
process.env.E2E_DATABASE_URL = supabase.dbUrl;
process.env.E2E_SUPABASE_ANON_KEY = supabase.anonKey;
process.env.E2E_SUPABASE_SERVICE_ROLE_KEY = supabase.serviceRoleKey;

const BASE_URL = 'http://localhost:3000';
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  // 같은 시드 데이터(매물·홀딩)를 바꾸므로 한 번에 하나씩 돈다
  workers: 1,
  fullyParallel: false,
  forbidOnly: CI,
  // 흔들리는 테스트는 GitHub 검사에서 한 번 더 돌리고 "flaky"로 표시한다(안정적인지 보는 기간, #592)
  retries: CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    // 실패하면 사진과 trace(단계별 화면·네트워크 기록)를 남긴다. GitHub 검사는 결과 파일로 올린다
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // PC 화면(1280×800)부터 한다. 폰 크기(375×812)는 3차(#592)
  projects: [
    {
      name: 'pc',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // GitHub 검사는 앞 단계에서 같은 값으로 빌드해 두고 켜기만 한다. 내 컴퓨터는 E2E 값으로 다시 빌드한다
    // (그냥 빌드하면 .env.local의 공용 개발 DB 주소가 화면 코드에 들어간다)
    command: CI ? 'npm run start' : 'npm run build && npm run start',
    url: BASE_URL,
    // 이미 켜진 서버(npm run dev, 공용 개발 DB)에 붙지 않는다. 3000번이 쓰이고 있으면 끄고 다시 돌린다
    reuseExistingServer: false,
    timeout: 300_000,
    env: e2eAppEnv(supabase),
  },
});
