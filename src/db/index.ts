import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

// 서버 전용 DB 접속. 브라우저 코드(use client)에서 가져다 쓰지 않는다.
// Supabase 트랜잭션 풀러(포트 6543)에 접속하므로 prepared statement를 끈다(prepare: false).

function createDb(url: string) {
  return drizzle(postgres(url, { prepare: false }), { schema, casing: 'snake_case' });
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
