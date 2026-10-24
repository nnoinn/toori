// DB 테스트 도우미 (docs/tech-guide.md 3-4 "DB 테스트").
// DB 테스트는 TEST_DATABASE_URL(테스트용 Postgres)이 있을 때만 돈다. CI는 늘 있고, 내 컴퓨터에 Docker가 없으면 건너뛴다.
// 개발 DB(DATABASE_URL)에는 접속하지 않는다.

import { DrizzleQueryError, TransactionRollbackError } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { describe } from 'vitest';

import * as schema from '@/db/schema';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** 테스트 DB 주소가 내 컴퓨터(또는 CI 안)의 Postgres인지 확인한다. 개발 DB 주소를 넣는 실수를 막는다 */
export function assertLocalTestDb(url: string) {
  if (!LOCAL_HOSTS.has(new URL(url).hostname)) {
    throw new Error(
      'TEST_DATABASE_URL에는 내 컴퓨터(localhost)의 테스트용 Postgres만 넣을 수 있어요. 개발 DB 주소는 넣지 마세요.',
    );
  }
}

/** DB 테스트 묶음. TEST_DATABASE_URL이 없으면 건너뛴다 */
export const describeDb = describe.skipIf(!process.env.TEST_DATABASE_URL);

function createTestDb(url: string) {
  return drizzle(postgres(url, { max: 1, onnotice: () => {} }), { schema, casing: 'snake_case' });
}

type TestDb = ReturnType<typeof createTestDb>;
export type TestTx = Parameters<Parameters<TestDb['transaction']>[0]>[0];

let db: TestDb | undefined;

function getTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL이 없어요. DB 테스트는 describeDb 안에 써 주세요.');
  }
  assertLocalTestDb(url);
  db ??= createTestDb(url);
  return db;
}

/** 테스트 파일 끝에 접속을 닫는다. 예: afterAll(closeTestDb) */
export async function closeTestDb() {
  await db?.$client.end();
  db = undefined;
}

/** 트랜잭션 안에서 테스트를 돌리고 끝나면 모두 되돌린다. 테스트끼리 데이터가 섞이지 않는다 */
export async function withRollback(run: (tx: TestTx) => Promise<void>) {
  try {
    await getTestDb().transaction(async (tx) => {
      await run(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

/** withRollback의 postgres.js 버전. Drizzle 없이 SQL을 쓰는 scripts/의 명령(시드 등)을 테스트할 때 쓴다 */
export async function withRollbackSql(run: (sql: postgres.TransactionSql) => Promise<void>) {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error('TEST_DATABASE_URL이 없어요. DB 테스트는 describeDb 안에 써 주세요.');
  }
  assertLocalTestDb(url);
  const client = postgres(url, { max: 1, onnotice: () => {} });
  const rollback = new Error('rollback');
  try {
    await client.begin(async (sql) => {
      await run(sql);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await client.end();
  }
}

/**
 * 쿼리가 어긴 DB 제약 이름을 돌려준다. 어긴 게 없으면 undefined.
 * 예: expect(await violatedConstraint(tx, (t) => t.insert(slots).values(...))).toBe('slots_no_overlap')
 * savepoint 안에서 돌리므로 실패해도 바깥 트랜잭션(withRollback)은 계속 쓸 수 있다.
 */
export async function violatedConstraint(
  tx: TestTx,
  run: (t: TestTx) => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
  } catch (error) {
    const cause = error instanceof DrizzleQueryError ? error.cause : error;
    const name = (cause as { constraint_name?: string } | undefined)?.constraint_name;
    if (name) return name;
    throw error;
  }
  return undefined;
}
