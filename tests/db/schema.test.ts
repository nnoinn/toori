// W1a 스키마가 실제 Postgres에서 약속대로 막고 허용하는지 확인한다 (docs/schema-v1.md, S-209).
// TEST_DATABASE_URL이 없으면 건너뛴다(CI에서는 늘 돈다).

import { sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { shops, slots } from '@/db/schema';

import { createTestShop, TEST_LOCATION, testSlot } from './fixtures';
import { closeTestDb, describeDb, violatedConstraint, withRollback } from './test-db';

afterAll(closeTestDb);

describeDb('W1a 스키마 (실제 DB)', () => {
  it('샵 위치를 PostGIS로 저장하고 그대로 읽으며 거리를 m로 계산한다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createTestShop(tx);
      const [row] = await tx
        .select({
          location: shops.location,
          meters: sql<number>`ST_Distance(${shops.location}, ST_GeogFromText('SRID=4326;POINT(126.8408 37.3219)'))`,
        })
        .from(shops)
        .where(sql`${shops.id} = ${shopId}`);
      expect(row.location).toEqual(TEST_LOCATION);
      // 경도 0.01도 차이 ≈ 885m (위도 37.3도)
      expect(row.meters).toBeGreaterThan(870);
      expect(row.meters).toBeLessThan(900);
    });
  });

  it('같은 샵에서 시간이 겹치는 게시중 매물은 막는다 (S-209)', async () => {
    await withRollback(async (tx) => {
      const ids = await createTestShop(tx);
      await tx.insert(slots).values(testSlot(ids, '10:00', '11:00'));
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(ids, '10:30', '11:30')),
        ),
      ).toBe('slots_no_overlap');
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(ids, '09:00', '12:00', { status: 'scheduled' })),
        ),
      ).toBe('slots_no_overlap');
    });
  });

  it('끝 시각에 바로 이어지는 매물, 마감된 매물과 겹치는 매물, 다른 샵 매물은 등록된다', async () => {
    await withRollback(async (tx) => {
      const ids = await createTestShop(tx);
      const other = await createTestShop(tx);
      await tx.insert(slots).values(testSlot(ids, '10:00', '11:00'));
      await tx.insert(slots).values(
        testSlot(ids, '12:00', '13:00', {
          status: 'closed',
          closedAt: new Date(),
          closeReason: 'other_channel',
        }),
      );

      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(ids, '11:00', '12:00')),
        ),
      ).toBeUndefined();
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(ids, '12:00', '13:00')),
        ),
      ).toBeUndefined();
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(other, '10:00', '11:00')),
        ),
      ).toBeUndefined();
    });
  });

  it('할인율 범위, 시간 순서, 상태 값을 벗어난 매물은 막는다', async () => {
    await withRollback(async (tx) => {
      const ids = await createTestShop(tx);
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(ids, '10:00', '11:00', { discountRate: 5 })),
        ),
      ).toBe('slots_discount_rate_check');
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(ids, '11:00', '10:00')),
        ),
      ).toBe('slots_time_order_check');
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(testSlot(ids, '10:00', '11:00', { status: 'deleted' })),
        ),
      ).toBe('slots_status_check');
    });
  });
});
