// 고객 이름(마이그레이션 0015, #375)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - 고객 계정은 이름 없이 만들 수 없다(NOT NULL). 길이(앞뒤 공백 빼고 1~30자)는 계정 확인 함수가 검사한다
// - 0015 전에 있던 계정을 닉네임으로 채운 것은 마이그레이션 SQL(UPDATE)이 하고, 테스트 DB는 빈 상태에서 만들어서 여기서는 보지 않는다

import { DrizzleQueryError, eq, sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers } from '@/db/schema';

import { createTestUser } from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** savepoint 안에서 돌려 실패한 DB 오류를 돌려준다. 성공하면 undefined */
async function failure(tx: TestTx, run: (t: TestTx) => Promise<unknown>): Promise<unknown> {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
  } catch (error) {
    return error instanceof DrizzleQueryError ? error.cause : error;
  }
  return undefined;
}

describeDb('고객 이름 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('고객 계정은 이름 없이 만들 수 없고, 이름과 닉네임을 따로 저장한다', async () => {
    await withRollback(async (tx) => {
      const nameless = await createTestUser(tx);
      expect(
        await failure(tx, (t) =>
          t.execute(
            sql`insert into customers (user_id, nickname) values (${nameless}, '이름 없는 고객')`,
          ),
        ),
      ).toMatchObject({ code: '23502', column_name: 'name' });

      const userId = await createTestUser(tx);
      await tx.insert(customers).values({ userId, name: '김투리', nickname: '투리팬' });
      const [row] = await tx.select().from(customers).where(eq(customers.userId, userId));
      expect(row).toMatchObject({ name: '김투리', nickname: '투리팬' });
    });
  });
});
