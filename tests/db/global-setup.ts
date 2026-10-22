// DB 테스트 준비 (vitest globalSetup, docs/tech-guide.md 3-4 "DB 테스트").
// TEST_DATABASE_URL이 있을 때만 돈다. 그냥 Postgres에는 Supabase가 미리 만들어 두는 것(extensions 스키마,
// 로그인 정보 auth.users, search_path)이 없어서 최소한만 흉내 낸 뒤 src/db/migrations를 고치지 않고 그대로 적용한다.

import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { assertLocalTestDb } from './test-db';

// auth.users는 Drizzle의 authUsers(drizzle-orm/supabase)가 아는 컬럼만 둔다. search_path는 Supabase 기본값과 같게 맞춘다
const SUPABASE_STUB = `
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email varchar(255),
    phone text UNIQUE,
    email_confirmed_at timestamptz,
    phone_confirmed_at timestamptz,
    last_sign_in_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
  );
  ALTER ROLE CURRENT_USER SET search_path = "$user", public, extensions;
`;

const MIGRATIONS = fileURLToPath(new URL('../../src/db/migrations', import.meta.url));

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  assertLocalTestDb(url);

  const stub = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await stub.unsafe(SUPABASE_STUB);
  } finally {
    await stub.end();
  }

  // search_path는 새 접속부터 적용되므로 접속을 새로 열어 마이그레이션한다
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS });
  } finally {
    await client.end();
  }
}
