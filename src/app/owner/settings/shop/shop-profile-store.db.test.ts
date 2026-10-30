// 원장님 프로필 읽기·저장이 그 샵만, 약속한 칸만 바꾸는지 실제 DB로 본다(O2, S-103).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { shops } from '@/db/schema';
import type { GeocodeResult } from '@/features/map/geocode';

import { createTestShop, TEST_LOCATION } from '../../../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  type TestTx,
  withRollback,
} from '../../../../../tests/db/test-db';
import type { ShopProfileValues } from './shop-profile';
import { selectShopProfile, updateShopProfile } from './shop-profile-store';

afterAll(closeTestDb);

const shopRow = async (tx: TestTx, shopId: string) =>
  (await tx.select().from(shops).where(eq(shops.id, shopId)))[0];

const values = (overrides: Partial<ShopProfileValues> = {}): ShopProfileValues => ({
  name: '투리 네일',
  category: 'nail_lash',
  phone: '031-987-6543',
  roadAddress: '경기 안산시 단원구 테스트로 1',
  addressDetail: '3층',
  description: '젤 네일 전문이에요',
  businessHours: [
    { weekday: 0, closed: true },
    { weekday: 1, open: '10:00', close: '20:00' },
  ],
  ...overrides,
});

const geocoded: GeocodeResult = {
  roadAddress: '경기도 안산시 상록구 새주소로 2',
  jibunAddress: '경기도 안산시 상록구 본오동 2',
  lat: 37.3,
  lng: 126.85,
  region: { sido: '경기', sigungu: '안산시 상록구', sigunguCode: '41271' },
};

describeDb('원장님 프로필 (실제 DB)', () => {
  it('지금 프로필을 읽는다. 가입 직후 영업시간은 빈 목록이다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createTestShop(tx);
      expect(await selectShopProfile(tx, shopId)).toEqual({
        name: '테스트 미용실',
        category: 'hair',
        phone: '000-0000-0000',
        roadAddress: '경기 안산시 단원구 테스트로 1',
        addressDetail: null,
        description: null,
        businessHours: [],
      });
      expect(await selectShopProfile(tx, crypto.randomUUID())).toBeNull();
    });
  });

  it('주소가 그대로면 좌표·지역은 건드리지 않고 나머지를 저장한다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createTestShop(tx);
      expect(await updateShopProfile(tx, shopId, values(), null)).toBe(true);

      const row = await shopRow(tx, shopId);
      expect(row).toMatchObject({
        name: '투리 네일',
        category: 'nail_lash',
        phone: '031-987-6543',
        addressDetail: '3층',
        description: '젤 네일 전문이에요',
        businessHours: values().businessHours,
        sigunguCode: '41273',
        location: TEST_LOCATION,
      });
      // 사업자 정보와 입점 상태는 그대로다(D19)
      expect(row).toMatchObject({ businessName: '테스트 미용실', status: 'pending' });
    });
  });

  it('주소가 바뀌면 변환 결과로 도로명 주소·지번·지역·좌표를 같이 바꾼다', async () => {
    await withRollback(async (tx) => {
      const { shopId } = await createTestShop(tx);
      await updateShopProfile(tx, shopId, values({ roadAddress: '새주소로 2' }), geocoded);

      expect(await shopRow(tx, shopId)).toMatchObject({
        roadAddress: '경기도 안산시 상록구 새주소로 2',
        jibunAddress: '경기도 안산시 상록구 본오동 2',
        sido: '경기',
        sigungu: '안산시 상록구',
        sigunguCode: '41271',
        location: { lat: 37.3, lng: 126.85 },
      });
    });
  });

  it('다른 샵은 바꾸지 않고, 없는 샵이면 false', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestShop(tx);
      const other = await createTestShop(tx);
      await updateShopProfile(tx, mine.shopId, values(), null);

      expect((await shopRow(tx, other.shopId)).name).toBe('테스트 미용실');
      expect(await updateShopProfile(tx, crypto.randomUUID(), values(), null)).toBe(false);
    });
  });
});
