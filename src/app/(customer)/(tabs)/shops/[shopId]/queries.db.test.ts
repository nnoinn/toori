// 샵 프로필 조회가 승인된 샵만, 보여 줄 메뉴·매물만 돌려주는지 실제 DB로 본다(C-309, C-306).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { menus, shopImages, slots } from '@/db/schema';

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
import { selectPublicShopProfile, selectShopSlots } from './queries';

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

const profileOf = (tx: TestTx, shopId: string) => selectPublicShopProfile(tx, { shopId });

/** 그 고객이 보는 이 샵의 지금 매물 id(시작이 가까운 순) */
async function slotIdsSeenBy(tx: TestTx, shop: TestShop, customerId: string | null) {
  const profile = await profileOf(tx, shop.shopId);
  if (!profile) throw new Error('프로필 없음');
  const items = await selectShopSlots(tx, { profile, customerId, now: NOW });
  return items.map((item) => (item.kind === 'slot' ? item.slotId : item.windowId));
}

describeDb('샵 프로필 조회', () => {
  it('승인된 샵: 샵 정보, 판매자 정보, 숨기지 않은 메뉴만 원장님이 정한 순서로, 사진은 대표 먼저', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, {
        status: 'approved',
        description: '샵 소개',
        addressDetail: '2층',
        businessName: '테스트 상호',
        representativeName: '테스트 대표',
        businessRegistrationNumber: '1234567890',
      });
      // createTestShop이 만든 커트(순서 0) 앞뒤로 메뉴를 더한다. 숨긴 메뉴는 빠진다
      await tx.insert(menus).values([
        {
          shopId: shop.shopId,
          serviceType: 'perm',
          name: '펌',
          listPrice: 80000,
          durationMinutes: 120,
          sortOrder: 2,
        },
        {
          shopId: shop.shopId,
          serviceType: 'cut',
          name: '앞머리 커트',
          listPrice: 5000,
          durationMinutes: 30,
          sortOrder: 1,
        },
        {
          shopId: shop.shopId,
          serviceType: 'color',
          name: '숨긴 염색',
          listPrice: 60000,
          durationMinutes: 90,
          sortOrder: 3,
          hiddenAt: NOW,
        },
      ]);
      await tx.insert(shopImages).values([
        { shopId: shop.shopId, kind: 'style', storagePath: 'shop/style-1.jpg', sortOrder: 1 },
        { shopId: shop.shopId, kind: 'main', storagePath: 'shop/main.jpg', sortOrder: 0 },
      ]);

      const profile = await profileOf(tx, shop.shopId);
      expect(profile).toMatchObject({
        shop: { shopId: shop.shopId, name: '테스트 미용실', description: '샵 소개' },
        category: '미용실',
        sigunguCode: '41273',
        menus: [
          { name: '커트', listPrice: 20000 },
          { name: '앞머리 커트', listPrice: 5000 },
          { name: '펌', listPrice: 80000 },
        ],
        seller: {
          businessName: '테스트 상호',
          representativeName: '테스트 대표',
          businessRegistrationNumber: '1234567890',
          roadAddress: '경기 안산시 단원구 테스트로 1',
          addressDetail: '2층',
          phone: '000-0000-0000',
        },
      });
      expect(profile?.menus).toHaveLength(3);
      expect(profile?.shop.lat).toBeCloseTo(TEST_LOCATION.lat, 5);
      // Supabase 주소가 없는 테스트 환경이면 이미지 주소도 없다
      if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
        expect(profile?.imageUrls.map((url) => url.split('/').at(-1))).toEqual([
          'main.jpg',
          'style-1.jpg',
        ]);
      } else {
        expect(profile?.imageUrls).toEqual([]);
      }
    });
  });

  it('승인된 샵이면 판매자 정보가 비어 있지 않다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const seller = (await profileOf(tx, shop.shopId))?.seller;
      expect(seller).toBeDefined();
      for (const value of [
        seller?.businessName,
        seller?.representativeName,
        seller?.businessRegistrationNumber,
        seller?.roadAddress,
        seller?.phone,
      ]) {
        expect(value?.trim()).toBeTruthy();
      }
    });
  });

  it('승인 대기·반려·탈퇴한 샵과 없는 샵은 null(404)', async () => {
    await withRollback(async (tx) => {
      const pending = await createTestShop(tx, { status: 'pending' });
      const rejected = await createTestShop(tx, { status: 'rejected', rejectionReason: '서류' });
      const withdrawn = await createTestShop(tx, { status: 'withdrawn' });

      expect(await profileOf(tx, pending.shopId)).toBeNull();
      expect(await profileOf(tx, rejected.shopId)).toBeNull();
      expect(await profileOf(tx, withdrawn.shopId)).toBeNull();
      expect(await profileOf(tx, crypto.randomUUID())).toBeNull();
    });
  });

  it('지금 매물: 이 샵의 게시중 매물만 시작이 가까운 순, 신규 고객 전용은 그 샵 이력이 있는 고객에게 빠진다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const otherShop = await createTestShop(tx, { status: 'approved' });
      const visited = await createTestCustomer(tx);
      const fresh = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '08:00', '09:00', 'completed');

      const later = await insertSlot(tx, shop, '14:00', '15:00');
      const sooner = await insertSlot(tx, shop, '10:00', '11:00');
      const newOnly = await insertSlot(tx, shop, '12:00', '13:00', { newCustomerOnly: true });
      await insertSlot(tx, shop, '16:00', '17:00', { status: 'closed' });
      await insertSlot(tx, otherShop, '09:30', '10:30');

      expect(await slotIdsSeenBy(tx, shop, fresh.customerId)).toEqual([
        sooner.id,
        newOnly.id,
        later.id,
      ]);
      expect(await slotIdsSeenBy(tx, shop, visited.customerId)).toEqual([sooner.id, later.id]);
      // 로그인하지 않으면 신규 고객 전용도 거르지 않는다(매물 목록과 같다, #49 3장)
      expect(await slotIdsSeenBy(tx, shop, null)).toEqual([sooner.id, newOnly.id, later.id]);
    });
  });
});
