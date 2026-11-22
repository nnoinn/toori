// 서버 DB 접속(src/db/index.ts의 createDb, getDb()와 같은 설정)으로 실제 트랜잭션을 열어 본다(#538).
// 설정값만 보는 index.test.ts로는 트랜잭션이 모두 실패하던 것(UNSAFE_TRANSACTION)을 잡지 못했다.
// 다른 DB 테스트는 tests/db/test-db.ts의 따로 만든 접속을 써서, 앱이 쓰는 접속은 여기서만 본다.

import { sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { describeDb } from '../../tests/db/test-db';

import { createDb } from './index';

describeDb('서버 DB 접속의 트랜잭션 (실제 DB)', () => {
  const url = process.env.TEST_DATABASE_URL;
  // postgres.js는 첫 조회 때 접속한다. 주소가 없으면(건너뛸 때) 만들지 않는다
  const db = url ? createDb(url) : null;

  afterAll(async () => {
    await db?.$client.end();
    await db?.$transactionClient.end();
  });

  it('트랜잭션을 열고 커밋한다(max_pipeline 0인 접속만 쓰면 UNSAFE_TRANSACTION으로 실패했다)', async () => {
    const rows = await db!.transaction(async (tx) => tx.execute(sql`select 1 as one`));
    expect(Array.from(rows)).toEqual([{ one: 1 }]);
  });

  it('트랜잭션 안에서 오류가 나면 되돌리고, 그 뒤 트랜잭션도 열린다', async () => {
    await expect(
      db!.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        throw new Error('되돌리기 확인');
      }),
    ).rejects.toThrow('되돌리기 확인');
    const rows = await db!.transaction(async (tx) => tx.execute(sql`select 2 as two`));
    expect(Array.from(rows)).toEqual([{ two: 2 }]);
  });

  it('트랜잭션 밖 조회는 조회용 접속으로 보낸다', async () => {
    const rows = await db!.execute(sql`select 3 as three`);
    expect(Array.from(rows)).toEqual([{ three: 3 }]);
  });
});
