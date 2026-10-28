// 매물 상세 조회가 보여 줄 매물만, 상태에 맞게 돌려주는지 실제 DB로 본다(J7, #49·#50·연결 #16).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { shopImages, slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  TEST_LOCATION,
  testSlot,
  type TestShop,
} from '../../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../../tests/db/test-db';
import { selectSlotDetail } from './queries';

afterAll(closeTestDb);

/** 매물(11/1)은 모두 게시 시각(10/30) 뒤, 시작 전 */
const NOW = new Date('2026-10-31T09:00:00+09:00');

async function insertSlot(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slots.$inferInsert> = {},
) {
  const [row] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, extra))
    .returning();
  return row;
}

const detail = (tx: TestTx, slotId: string, customerId: string | null = null, now = NOW) =>
  selectSlotDetail(tx, { slotId, customerId, now });

describeDb('매물 상세 조회', () => {
  it('게시중 매물의 매물·샵 정보와 이미지(대표 먼저)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', description: '샵 소개' });
      const slot = await insertSlot(tx, shop, '10:00', '11:00', { menuDescription: '메뉴 설명' });
      await tx.insert(shopImages).values([
        { shopId: shop.shopId, kind: 'style', storagePath: 'shop/style-2.jpg', sortOrder: 2 },
        { shopId: shop.shopId, kind: 'main', storagePath: 'shop/main.jpg', sortOrder: 0 },
        { shopId: shop.shopId, kind: 'style', storagePath: 'shop/style-1.jpg', sortOrder: 1 },
      ]);

      const result = await detail(tx, slot.id);
      expect(result).toMatchObject({
        slotId: slot.id,
        availability: 'available',
        badges: [],
        listPrice: 20000,
        salePrice: 14000,
        discountRate: 30,
        menu: { name: '커트', description: '메뉴 설명', durationMinutes: 60 },
        shop: { shopId: shop.shopId, name: '테스트 미용실', description: '샵 소개' },
      });
      expect(result?.shop.lat).toBeCloseTo(TEST_LOCATION.lat, 5);
      expect(result?.shop.lng).toBeCloseTo(TEST_LOCATION.lng, 5);
      // Supabase 주소가 없는 테스트 환경이면 이미지 주소도 없다
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        expect(result?.imageUrls.map((url) => url.split('/').at(-1))).toEqual([
          'main.jpg',
          'style-1.jpg',
          'style-2.jpg',
        ]);
      } else {
        expect(result?.imageUrls).toEqual([]);
      }
    });
  });

  it('승인되지 않은 샵, 게시 전 매물, 없는 매물은 null(404)', async () => {
    await withRollback(async (tx) => {
      const pending = await createTestShop(tx, { status: 'pending' });
      const shop = await createTestShop(tx, { status: 'approved' });
      const pendingSlot = await insertSlot(tx, pending, '10:00', '11:00');
      const scheduled = await insertSlot(tx, shop, '12:00', '13:00', {
        status: 'scheduled',
        publishAt: new Date('2026-11-01T00:00:00+09:00'),
      });

      expect(await detail(tx, pendingSlot.id)).toBeNull();
      expect(await detail(tx, scheduled.id)).toBeNull();
      expect(await detail(tx, crypto.randomUUID())).toBeNull();
    });
  });

  it('신규 고객 전용은 그 샵 이력이 있는 고객에게만 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const visited = await createTestCustomer(tx);
      const fresh = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '08:00', '09:00', 'completed');
      const slot = await insertSlot(tx, shop, '10:00', '11:00', { newCustomerOnly: true });

      expect(await detail(tx, slot.id, visited.customerId)).toBeNull();
      expect((await detail(tx, slot.id, fresh.customerId))?.badges).toEqual(['newCustomerOnly']);
      expect(await detail(tx, slot.id, null)).not.toBeNull();
    });
  });

  it('예약할 수 있는지: 남이 홀딩 → onHold, 내가 홀딩 → mine, 마감·시작 지남 → closed', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const someone = await createTestCustomer(tx);
      const holdExpiresAt = new Date(NOW.getTime() + 5 * 60_000);

      const held = await insertSlot(tx, shop, '10:00', '11:00', {
        holdCustomerId: someone.customerId,
        holdExpiresAt,
      });
      const mine = await insertSlot(tx, shop, '12:00', '13:00', {
        holdCustomerId: me.customerId,
        holdExpiresAt,
      });
      const closed = await insertSlot(tx, shop, '14:00', '15:00', { status: 'closed' });

      const heldDetail = await detail(tx, held.id, me.customerId);
      expect(heldDetail?.availability).toBe('onHold');
      expect(heldDetail?.badges).toEqual(['onHold']);
      expect((await detail(tx, mine.id, me.customerId))?.availability).toBe('mine');
      expect((await detail(tx, mine.id, null))?.availability).toBe('onHold');

      const closedDetail = await detail(tx, closed.id);
      expect(closedDetail?.availability).toBe('closed');
      expect(closedDetail?.badges).toEqual([]);
      // 팔리지 않고 시작 시각이 지나면 마감으로 보여 준다
      const afterStart = new Date('2026-11-01T10:30:00+09:00');
      expect((await detail(tx, held.id, null, afterStart))?.availability).toBe('closed');
    });
  });
});
