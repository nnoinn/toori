// DB 접속 설정(src/db/index.ts)을 확인한다. 조회를 보내지 않아서 실제로 접속하지 않는다(postgres.js는 첫 조회 때 접속한다).

import { afterAll, expect, it, vi } from 'vitest';

import { getDb } from './index';

afterAll(() => {
  vi.unstubAllEnvs();
});

it('트랜잭션 풀러에 맞게 prepared statement를 끄고, 한 연결에 조회를 겹쳐 보내지 않는다(겹쳐 보낸 조회가 멈췄다, 11/20)', () => {
  // 로컬에는 DB 주소가 없을 수 있다. 접속하지 않으니 아무 주소나 넣는다
  vi.stubEnv(
    'DATABASE_URL',
    process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test',
  );
  // max_pipeline은 postgres.js 타입 정의에 없어서 넓혀 읽는다
  const options = getDb().$client.options as { prepare: boolean; max_pipeline?: number };
  expect(options.prepare).toBe(false);
  expect(options.max_pipeline).toBe(0);
});

it('트랜잭션은 트랜잭션용 접속으로 연다(max_pipeline 0인 접속에서는 트랜잭션이 모두 실패했다, #538)', () => {
  vi.stubEnv(
    'DATABASE_URL',
    process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test',
  );
  const db = getDb();
  const options = db.$transactionClient.options as { prepare: boolean; max_pipeline?: number };
  expect(options.prepare).toBe(false);
  // 0이면 postgres.js가 트랜잭션 연결을 잡지 못한다
  expect(options.max_pipeline).toBeGreaterThan(0);
  // drizzle의 db.transaction은 client.begin을 부른다
  expect(db.$client.begin).toBe(db.$transactionClient.begin);
});
