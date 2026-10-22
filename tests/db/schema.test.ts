// W1a 스키마가 실제 Postgres에서 약속대로 막고 허용하는지 확인한다 (docs/schema-v1.md, S-209).
// TEST_DATABASE_URL이 없으면 건너뛴다(CI에서는 늘 돈다).

import { sql } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { afterAll, expect, it } from 'vitest';

import { menus, owners, profiles, shops, slots } from '@/db/schema';

import { closeTestDb, describeDb, type TestTx, violatedConstraint, withRollback } from './test-db';

afterAll(closeTestDb);

// 안산시청 근처(가짜 샵 위치)
const ANSAN = { lng: 126.8308, lat: 37.3219 };

/** 로그인 정보 → 원장님 계정 → 샵 → 메뉴까지 만들고 매물에 필요한 id를 돌려준다 */
async function createShop(tx: TestTx) {
  const userId = crypto.randomUUID();
  await tx.insert(authUsers).values({ id: userId });
  await tx.insert(profiles).values({ id: userId, email: 'owner@test.invalid' });
  const [owner] = await tx
    .insert(owners)
    .values({ userId, name: '테스트 원장', phone: '000-0000-0000' })
    .returning();
  const [shop] = await tx
    .insert(shops)
    .values({
      ownerId: owner.id,
      name: '테스트 미용실',
      category: 'hair',
      phone: '000-0000-0000',
      roadAddress: '경기도 안산시 단원구 테스트로 1',
      sido: '경기도',
      sigungu: '안산시 단원구',
      sigunguCode: '41273',
      location: ANSAN,
      businessName: '테스트 미용실',
      representativeName: '테스트 원장',
      businessRegistrationNumber: '000-00-00000',
      openedOn: '2026-01-01',
      businessDocPath: 'test/business-doc.pdf',
    })
    .returning();
  const [menu] = await tx
    .insert(menus)
    .values({
      shopId: shop.id,
      serviceType: 'cut',
      name: '커트',
      listPrice: 20000,
      durationMinutes: 60,
      sortOrder: 0,
    })
    .returning();
  return { shopId: shop.id, menuId: menu.id, createdBy: userId };
}

type ShopIds = Awaited<ReturnType<typeof createShop>>;

/** 매물 한 건. 시각은 'HH:MM'(2026-11-01, 한국 시간) */
function slot(
  ids: ShopIds,
  start: string,
  end: string,
  extra: Partial<typeof slots.$inferInsert> = {},
) {
  const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
  return {
    ...ids,
    serviceType: 'cut',
    menuName: '커트',
    listPrice: 20000,
    durationMinutes: 60,
    discountRate: 30,
    salePrice: 14000,
    startAt: at(start),
    endAt: at(end),
    publishAt: new Date('2026-10-30T10:00:00+09:00'),
    status: 'published',
    ...extra,
  } satisfies typeof slots.$inferInsert;
}

describeDb('W1a 스키마 (실제 DB)', () => {
  it('샵 위치를 PostGIS로 저장하고 그대로 읽으며 거리를 m로 계산한다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createShop(tx);
      const [row] = await tx
        .select({
          location: shops.location,
          meters: sql<number>`ST_Distance(${shops.location}, ST_GeogFromText('SRID=4326;POINT(126.8408 37.3219)'))`,
        })
        .from(shops)
        .where(sql`${shops.id} = ${shopId}`);
      expect(row.location).toEqual(ANSAN);
      // 경도 0.01도 차이 ≈ 885m (위도 37.3도)
      expect(row.meters).toBeGreaterThan(870);
      expect(row.meters).toBeLessThan(900);
    });
  });

  it('같은 샵에서 시간이 겹치는 게시중 매물은 막는다 (S-209)', async () => {
    await withRollback(async (tx) => {
      const ids = await createShop(tx);
      await tx.insert(slots).values(slot(ids, '10:00', '11:00'));
      expect(
        await violatedConstraint(tx, (t) => t.insert(slots).values(slot(ids, '10:30', '11:30'))),
      ).toBe('slots_no_overlap');
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(slot(ids, '09:00', '12:00', { status: 'scheduled' })),
        ),
      ).toBe('slots_no_overlap');
    });
  });

  it('끝 시각에 바로 이어지는 매물, 마감된 매물과 겹치는 매물, 다른 샵 매물은 등록된다', async () => {
    await withRollback(async (tx) => {
      const ids = await createShop(tx);
      const other = await createShop(tx);
      await tx.insert(slots).values(slot(ids, '10:00', '11:00'));
      await tx.insert(slots).values(
        slot(ids, '12:00', '13:00', {
          status: 'closed',
          closedAt: new Date(),
          closeReason: 'other_channel',
        }),
      );

      expect(
        await violatedConstraint(tx, (t) => t.insert(slots).values(slot(ids, '11:00', '12:00'))),
      ).toBeUndefined();
      expect(
        await violatedConstraint(tx, (t) => t.insert(slots).values(slot(ids, '12:00', '13:00'))),
      ).toBeUndefined();
      expect(
        await violatedConstraint(tx, (t) => t.insert(slots).values(slot(other, '10:00', '11:00'))),
      ).toBeUndefined();
    });
  });

  it('할인율 범위, 시간 순서, 상태 값을 벗어난 매물은 막는다', async () => {
    await withRollback(async (tx) => {
      const ids = await createShop(tx);
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(slot(ids, '10:00', '11:00', { discountRate: 5 })),
        ),
      ).toBe('slots_discount_rate_check');
      expect(
        await violatedConstraint(tx, (t) => t.insert(slots).values(slot(ids, '11:00', '10:00'))),
      ).toBe('slots_time_order_check');
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(slots).values(slot(ids, '10:00', '11:00', { status: 'deleted' })),
        ),
      ).toBe('slots_status_check');
    });
  });
});
