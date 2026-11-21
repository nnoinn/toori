import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

// 서버 전용 DB 접속. 브라우저 코드(use client)에서 가져다 쓰지 않는다.
// Supabase 트랜잭션 풀러(포트 6543)에 접속하므로 prepared statement를 끈다(prepare: false).

/**
 * postgres.js 접속 설정.
 * - prepare: false — 트랜잭션 풀러는 prepared statement를 쓸 수 없다.
 * - max_pipeline: 0 — 한 연결에 조회를 겹쳐 보내지 않는다(11/20). 동시에 보내는 조회가 연결 수(기본 10개)를 넘으면
 *   postgres.js는 쓰고 있는 연결에 다음 조회를 겹쳐 보내는데, 트랜잭션 풀러에서는 그렇게 겹쳐 보낸 조회 일부가
 *   오류도 없이 끝나지 않았다(운영자 첫 화면이 30초 멈춤. 세션 모드 5432에서는 멈추지 않음). 0이면 넘친 조회는
 *   연결이 빌 때까지 postgres.js 안에서 기다렸다가 보낸다.
 *   max_pipeline은 postgres.js 3.4 코드에 있는 설정이지만 타입 정의에 빠져 있어서, 글자 그대로 넘기지 않고 이 변수로 넘긴다.
 *   빠지지 않게 index.test.ts가 지킨다
 */
const CLIENT_OPTIONS = { prepare: false, max_pipeline: 0 };

function createDb(url: string) {
  return drizzle(postgres(url, CLIENT_OPTIONS), { schema, casing: 'snake_case' });
}

let db: ReturnType<typeof createDb> | undefined;

export function getDb() {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL이 없어요. 레포 최상위의 .env.local을 확인해 주세요.');
    }
    db = createDb(url);
  }
  return db;
}
