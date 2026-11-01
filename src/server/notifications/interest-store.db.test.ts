// 관심 동네 저장(readInterestAreas, replaceInterestAreas)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { afterAll, expect, it } from 'vitest';

import { createTestCustomer } from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readInterestAreas, replaceInterestAreas } from './interest-store';

describeDb('관심 동네 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('목록으로 바꾸면 더하고 빼고, 같은 동네를 다시 넣어도 하나', async () => {
    await withRollback(async (tx) => {
      const { customerId } = await createTestCustomer(tx);
      await replaceInterestAreas(tx, customerId, ['41271', '41273']);
      expect((await readInterestAreas(tx, customerId)).sort()).toEqual(['41271', '41273']);

      await replaceInterestAreas(tx, customerId, ['41273']);
      expect(await readInterestAreas(tx, customerId)).toEqual(['41273']);

      await replaceInterestAreas(tx, customerId, ['41273', '41271']);
      expect((await readInterestAreas(tx, customerId)).sort()).toEqual(['41271', '41273']);

      await replaceInterestAreas(tx, customerId, []);
      expect(await readInterestAreas(tx, customerId)).toEqual([]);
    });
  });

  it('다른 고객의 관심 동네는 건드리지 않는다', async () => {
    await withRollback(async (tx) => {
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      await replaceInterestAreas(tx, other.customerId, ['41271']);
      await replaceInterestAreas(tx, me.customerId, []);
      expect(await readInterestAreas(tx, other.customerId)).toEqual(['41271']);
    });
  });
});
