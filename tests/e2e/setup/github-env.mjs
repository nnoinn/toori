// GitHub 검사(.github/workflows/e2e.yml)용: 로컬 Supabase 값과 E2E 전용 가짜 값을 $GITHUB_ENV에 넣을 줄로 찍는다.
// 빌드·실행·테스트 단계가 같은 값을 쓴다. 값은 그 검사 안의 로컬 Supabase 것이라 공개돼도 상관없다(로컬이 아니면 멈춘다)
//   node tests/e2e/setup/github-env.mjs >> "$GITHUB_ENV"

import { e2eAppEnv, readLocalSupabase } from './local-supabase.mjs';

const supabase = readLocalSupabase();
const lines = {
  ...e2eAppEnv(supabase),
  // 테스트 코드(시드 계정 로그인, 매물 고르기)와 playwright.config.ts가 읽는 값
  E2E_SUPABASE_URL: supabase.apiUrl,
  E2E_DATABASE_URL: supabase.dbUrl,
  E2E_SUPABASE_ANON_KEY: supabase.anonKey,
  E2E_SUPABASE_SERVICE_ROLE_KEY: supabase.serviceRoleKey,
};
for (const [key, value] of Object.entries(lines)) console.log(`${key}=${value}`);
