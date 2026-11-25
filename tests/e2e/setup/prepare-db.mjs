// E2E(#592) 전에 로컬 Supabase DB를 준비한다: src/db/migrations 적용 → 시드 계정(@seed.test) 로그인 정보 → 시드 데이터.
// 시드 내용은 공용 개발 DB와 같다(scripts/seed.mjs의 seedDevData). 다만 여기서는 로컬 Supabase에만 넣는다(local-supabase.mjs가 막는다).
// 실행: node tests/e2e/setup/prepare-db.mjs (npm run test:e2e가 먼저 부른다)

import { fileURLToPath, pathToFileURL } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { SEED_ACCOUNTS } from '../../../scripts/seed-data.mjs';
import { seedDevData } from '../../../scripts/seed.mjs';
import { readLocalSupabase } from './local-supabase.mjs';

const MIGRATIONS = fileURLToPath(new URL('../../../src/db/migrations', import.meta.url));

/** 시드 계정의 로그인 정보(auth.users)를 찾고, 없으면 Supabase 관리 기능으로 비밀번호 없이 만든다 */
async function ensureSeedUsers(sql, supabase) {
  const emails = SEED_ACCOUNTS.map((account) => account.email);
  const rows = await sql`select id, email from auth.users where email in ${sql(emails)}`;
  const idByEmail = new Map(rows.map((row) => [row.email, row.id]));
  const missing = SEED_ACCOUNTS.filter((account) => !idByEmail.has(account.email));
  if (missing.length > 0) {
    const admin = createClient(supabase.apiUrl, supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const account of missing) {
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        email_confirm: true,
        user_metadata: { seed: true },
      });
      if (error) throw new Error(`시드 계정 ${account.email}을 만들지 못했어요: ${error.message}`);
      idByEmail.set(account.email, data.user.id);
    }
  }
  return Object.fromEntries(
    SEED_ACCOUNTS.map((account) => [account.key, idByEmail.get(account.email)]),
  );
}

export async function prepareE2eDb(supabase = readLocalSupabase()) {
  // 마이그레이션 연결과 시드 연결을 따로 연다. drizzle(client)는 그 연결의 JSON·날짜 값 변환을 바꿔서
  // 시드(scripts/seed.mjs의 sql.json, Date)가 같은 연결을 쓰면 값을 보내지 못한다
  const migrator = postgres(supabase.dbUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(migrator), { migrationsFolder: MIGRATIONS });
  } finally {
    await migrator.end();
  }

  const client = postgres(supabase.dbUrl, { max: 1, onnotice: () => {} });
  try {
    const userIds = await ensureSeedUsers(client, supabase);
    return await client.begin((tx) => seedDevData(tx, { now: new Date(), userIds }));
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  prepareE2eDb()
    .then((result) => {
      console.log(
        `E2E DB 준비 끝: 계정 ${result.accounts}, 샵 ${result.shops}, 매물 ${result.slots}, 예약 ${result.reservations}`,
      );
    })
    .catch((error) => {
      // GitHub 검사에서 어느 줄에서 멈췄는지 보이게 위치(stack)까지 남긴다. 주소는 안전장치가 문구에 넣지 않는다
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    });
}
