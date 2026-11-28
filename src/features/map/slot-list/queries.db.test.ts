// 홈 목록·지도 조회가 보여줄 매물만, 정렬·커서대로 돌려주는지 실제 DB로 본다(J4, #19 D4·D8, #49·#50·연결 #16).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { favorites, slots, slotWindowMenus, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  TEST_LOCATION,
  testSlot,
  type TestShop,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { EMPTY_FILTERS, type HomeFilters } from '../filters';
import { parseSearchKeyword } from '../search';
import type { MapBounds } from '../types';
import { decodeCursor, SLOT_PAGE_SIZE } from './cursor';
import {
  countListItems,
  type HomeSlotQuery,
  selectFavoriteSlots,
  selectMapShops,
  selectSlotPage,
} from './queries';
import type { SlotSort } from './sort';
import type { ListItem } from './types';

afterAll(closeTestDb);

/** 테스트 샵(안산시청 근처)을 감싸는 영역 */
const BOUNDS: MapBounds = {
  sw: { lat: TEST_LOCATION.lat - 0.01, lng: TEST_LOCATION.lng - 0.01 },
  ne: { lat: TEST_LOCATION.lat + 0.01, lng: TEST_LOCATION.lng + 0.01 },
};
/** 영역 밖(대전 근처) */
const FAR_LOCATION = { lat: 36.35, lng: 127.38 };
/** 매물(11/1)은 모두 게시 시각(10/30) 뒤, 시작 전 */
const NOW = new Date('2026-10-31T09:00:00+09:00');

function baseQuery(extra: Partial<HomeSlotQuery> = {}): HomeSlotQuery {
  return { bounds: BOUNDS, filters: EMPTY_FILTERS, customerId: null, now: NOW, ...extra };
}

async function page(
  tx: TestTx,
  extra: Partial<HomeSlotQuery> & { sort?: SlotSort; cursor?: string | null; shopId?: string } = {},
) {
  const sort = extra.sort ?? 'near';
  return selectSlotPage(tx, {
    ...baseQuery(extra),
    origin: TEST_LOCATION,
    sort,
    cursor: decodeCursor(extra.cursor ?? null, sort),
    shopId: extra.shopId ?? null,
  });
}

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

// 테스트에서는 가짜 시간대가 꺼져 있어(listSlotWindows가 빈 목록) 매물만 나온다
const ids = (items: ListItem[]) =>
  items.map((item) => (item.kind === 'slot' ? item.slotId : item.windowId));

describeDb('홈 목록·지도 조회', () => {
  it('매물 목록: 고른 시·군·구 안의 매물만, 매물 수도 같은 조건(#215)', async () => {
    await withRollback(async (tx) => {
      // 테스트 샵은 기본이 안산시 단원구(41273)
      const danwon = await createTestShop(tx, { status: 'approved' });
      const sangnok = await createTestShop(tx, {
        status: 'approved',
        sigunguCode: '41271',
        sigungu: '안산시 상록구',
      });
      const shown = await insertSlot(tx, danwon, '10:00', '11:00');
      await insertSlot(tx, sangnok, '10:00', '11:00');
      await insertSlot(tx, danwon, '12:00', '13:00', { status: 'closed' });

      const query = { sigunguCode: '41273', filters: EMPTY_FILTERS, customerId: null, now: NOW };
      const result = await selectSlotPage(tx, {
        ...query,
        origin: TEST_LOCATION,
        sort: 'near',
        cursor: null,
        shopId: null,
      });
      expect(ids(result.items)).toEqual([shown.id]);
      expect(await countListItems(tx, query)).toBe(1);
    });
  });

  it('시간대 안에서 손님이 만든 매물은 목록·매물 수·지도·찜한 샵 매물에서 빠진다(#308, 시간대 카드로만 보인다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      await tx.insert(favorites).values({ customerId: me.customerId, shopId: shop.shopId });
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T13:00:00+09:00'),
          endAt: new Date('2026-11-01T18:00:00+09:00'),
          publishAt: new Date('2026-10-30T13:00:00+09:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning();
      const shown = await insertSlot(tx, shop, '10:00', '11:00');
      await insertSlot(tx, shop, '14:00', '15:00', { windowId: window.id });

      expect(ids((await page(tx)).items)).toEqual([shown.id]);
      expect(await countListItems(tx, baseQuery())).toBe(1);
      expect(await selectMapShops(tx, baseQuery())).toEqual([
        expect.objectContaining({ shopId: shop.shopId, slotCount: 1 }),
      ]);
      const liked = await selectFavoriteSlots(tx, {
        customerId: me.customerId,
        now: NOW,
        origin: null,
      });
      expect(ids(liked)).toEqual([shown.id]);
    });
  });

  it('찜한 샵 매물: 내가 찜한 샵의 보이는 매물만 임박순, 기준점이 없으면 거리 없음(#215, C-209)', async () => {
    await withRollback(async (tx) => {
      const liked = await createTestShop(tx, { status: 'approved' });
      // 찜한 샵이 멀리 있어도(지도 영역·시·군·구와 상관없이) 나온다
      const likedFar = await createTestShop(tx, {
        status: 'approved',
        location: FAR_LOCATION,
        sigunguCode: '30200',
      });
      const notLiked = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      await tx.insert(favorites).values([
        { customerId: me.customerId, shopId: liked.shopId },
        { customerId: me.customerId, shopId: likedFar.shopId },
        { customerId: other.customerId, shopId: notLiked.shopId },
      ]);

      const later = await insertSlot(tx, liked, '14:00', '15:00');
      const sooner = await insertSlot(tx, likedFar, '10:00', '11:00');
      await insertSlot(tx, liked, '12:00', '13:00', { status: 'closed' });
      await insertSlot(tx, notLiked, '09:00', '10:00');

      const items = await selectFavoriteSlots(tx, {
        customerId: me.customerId,
        now: NOW,
        origin: null,
      });
      expect(ids(items)).toEqual([sooner.id, later.id]);
      expect(items.map((item) => item.distanceMeters)).toEqual([null, null]);

      const near = await selectFavoriteSlots(tx, {
        customerId: me.customerId,
        now: NOW,
        origin: TEST_LOCATION,
      });
      expect(near[1].distanceMeters).toBeLessThan(1);
      expect(near[0].distanceMeters).toBeGreaterThan(10_000);
    });
  });

  it('승인 샵의 게시중 매물만, 지도 영역 안에서만', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const pending = await createTestShop(tx, { status: 'pending' });
      const far = await createTestShop(tx, { status: 'approved', location: FAR_LOCATION });

      const shown = await insertSlot(tx, shop, '10:00', '11:00');
      // 게시 시각 전(게시예정), 원장님 마감, 승인 대기 샵, 영역 밖 샵은 빠진다
      await insertSlot(tx, shop, '12:00', '13:00', {
        status: 'scheduled',
        publishAt: new Date('2026-11-01T00:00:00+09:00'),
      });
      await insertSlot(tx, shop, '14:00', '15:00', { status: 'closed' });
      await insertSlot(tx, pending, '10:00', '11:00');
      await insertSlot(tx, far, '10:00', '11:00');

      const result = await page(tx);
      expect(ids(result.items)).toEqual([shown.id]);
      expect(result.nextCursor).toBeNull();

      const shops = await selectMapShops(tx, baseQuery());
      expect(shops).toEqual([expect.objectContaining({ shopId: shop.shopId, slotCount: 1 })]);
      expect(shops[0].lat).toBeCloseTo(TEST_LOCATION.lat, 5);
      expect(shops[0].lng).toBeCloseTo(TEST_LOCATION.lng, 5);
    });
  });

  it('신규 고객 전용 매물은 그 샵 이력이 있는 고객에게 보이지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const visited = await createTestCustomer(tx);
      const fresh = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '08:00', '09:00', 'completed');

      const onlyNew = await insertSlot(tx, shop, '10:00', '11:00', { newCustomerOnly: true });
      const normal = await insertSlot(tx, shop, '12:00', '13:00');

      expect(ids((await page(tx, { customerId: visited.customerId })).items)).toEqual([normal.id]);
      expect(
        ids((await page(tx, { customerId: fresh.customerId, sort: 'imminent' })).items),
      ).toEqual([onlyNew.id, normal.id]);
      // 로그인 안 함(원장님 모드 포함)은 거르지 않는다(#49 3장)
      expect(ids((await page(tx, { sort: 'imminent' })).items)).toEqual([onlyNew.id, normal.id]);

      const [visitedMap] = await selectMapShops(tx, baseQuery({ customerId: visited.customerId }));
      expect(visitedMap.slotCount).toBe(1);
    });
  });

  it('필터: 업종·서비스 종류·가격대·시간대(한국 시간)·최소 할인율', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const nail = await createTestShop(tx, { status: 'approved', category: 'nail_lash' });

      // 오전 9시, 2만 원 30% → 14,000원
      const morning = await insertSlot(tx, shop, '09:00', '10:00');
      // 오후 2시, 4만 원 50% → 20,000원
      const afternoon = await insertSlot(tx, shop, '14:00', '15:00', {
        listPrice: 40000,
        discountRate: 50,
        salePrice: 20000,
      });
      // 저녁 7시, 8만 원 40% → 48,000원
      const evening = await insertSlot(tx, shop, '19:00', '20:00', {
        listPrice: 80000,
        discountRate: 40,
        salePrice: 48000,
      });
      const nailSlot = await insertSlot(tx, nail, '09:00', '10:00', { serviceType: 'gel_nail' });

      const filtered = (filters: Partial<HomeFilters>) =>
        page(tx, { sort: 'imminent', filters: { ...EMPTY_FILTERS, ...filters } }).then((result) =>
          ids(result.items).sort(),
        );

      expect(await filtered({ category: 'nail_lash' })).toEqual([nailSlot.id]);
      expect(await filtered({ category: 'hair', services: ['cut'] })).toEqual(
        [morning.id, afternoon.id, evening.id].sort(),
      );
      expect(await filtered({ minDiscount: 40 })).toEqual([afternoon.id, evening.id].sort());
      expect(await filtered({ prices: ['30k_50k'] })).toEqual([evening.id]);
      expect(
        await filtered({ prices: ['under_30k', '30k_50k'], times: ['afternoon', 'evening'] }),
      ).toEqual([afternoon.id, evening.id].sort());
      expect(await filtered({ times: ['morning'], category: 'hair' })).toEqual([morning.id]);
    });
  });

  it('검색(C-210): 고른 동네 안에서 샵 이름·메뉴 이름·서비스 종류 이름으로 찾고, 단어는 모두 맞아야 하며 매물 수도 같은 조건', async () => {
    await withRollback(async (tx) => {
      const handae = await createTestShop(tx, { status: 'approved', name: '테스트 한대앞 헤어' });
      const other = await createTestShop(tx, { status: 'approved', name: '테스트 다른 샵' });
      const sangnok = await createTestShop(tx, {
        status: 'approved',
        name: '테스트 한대앞 상록',
        sigunguCode: '41271',
        sigungu: '안산시 상록구',
      });
      const pending = await createTestShop(tx, { status: 'pending', name: '테스트 한대앞 대기' });

      // 메뉴 이름 '커트'(testSlot 기본), 서비스 종류 커트
      const cut = await insertSlot(tx, handae, '10:00', '11:00');
      const magic = await insertSlot(tx, other, '12:00', '13:00', {
        serviceType: 'perm',
        menuName: '볼륨 매직',
      });
      const percent = await insertSlot(tx, other, '14:00', '15:00', { menuName: '50% 특가 커트' });
      // 마감 매물, 다른 동네 샵, 승인 대기 샵은 이름이 맞아도 빠진다
      await insertSlot(tx, handae, '16:00', '17:00', {
        status: 'closed',
        serviceType: 'perm',
        menuName: '볼륨 매직',
      });
      await insertSlot(tx, sangnok, '10:00', '11:00');
      await insertSlot(tx, pending, '10:00', '11:00');

      const search = async (text: string) => {
        const query = {
          sigunguCode: '41273',
          filters: EMPTY_FILTERS,
          keyword: parseSearchKeyword(text),
          customerId: null,
          now: NOW,
        };
        const result = await selectSlotPage(tx, {
          ...query,
          origin: TEST_LOCATION,
          sort: 'imminent',
          cursor: null,
          shopId: null,
        });
        return { ids: ids(result.items), total: await countListItems(tx, query) };
      };

      // 샵 이름
      expect(await search('한대앞')).toEqual({ ids: [cut.id], total: 1 });
      // 메뉴 이름
      expect(await search('매직')).toEqual({ ids: [magic.id], total: 1 });
      // 서비스 종류 이름(메뉴 이름에 '펌'이 없어도)
      expect(await search('펌')).toEqual({ ids: [magic.id], total: 1 });
      // 단어는 모두 맞아야 한다(샵 이름 + 서비스 종류)
      expect((await search('다른 펌')).ids).toEqual([magic.id]);
      expect((await search('한대앞 펌')).ids).toEqual([]);
      // 메뉴 이름과 서비스 종류 '커트'
      expect((await search('커트')).ids).toEqual([cut.id, percent.id]);
      // % _ 는 글자 그대로 찾는다(모든 매물에 맞지 않는다)
      expect((await search('%')).ids).toEqual([percent.id]);
      expect((await search('_')).ids).toEqual([]);
      // 검색어가 없으면 거르지 않는다
      expect((await search('  ')).total).toBe(3);
    });
  });

  it('검색(C-210): 신규 고객 전용은 검색에서도 그 샵 이력이 있는 고객에게 빠지고, 필터와 같이 쓴다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', name: '테스트 한대앞 헤어' });
      const visited = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '08:00', '09:00', 'completed');
      const onlyNew = await insertSlot(tx, shop, '10:00', '11:00', { newCustomerOnly: true });
      const normal = await insertSlot(tx, shop, '12:00', '13:00', {
        listPrice: 40000,
        discountRate: 50,
        salePrice: 20000,
      });

      const keyword = parseSearchKeyword('한대앞');
      const found = (extra: Partial<HomeSlotQuery>) =>
        page(tx, { sort: 'imminent', keyword, ...extra }).then((result) => ids(result.items));

      expect(await found({ customerId: visited.customerId })).toEqual([normal.id]);
      expect(await found({})).toEqual([onlyNew.id, normal.id]);
      expect(await found({ filters: { ...EMPTY_FILTERS, minDiscount: 50 } })).toEqual([normal.id]);
    });
  });

  it('검색(C-210): 시간대 카드는 지금은 샵 이름으로만 찾는다(시간대 안 서비스 이름은 listSlotWindows가 받으면 바꾼다)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', name: '테스트 시간대 헤어' });
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T13:00:00+09:00'),
          endAt: new Date('2026-11-01T18:00:00+09:00'),
          publishAt: new Date('2026-10-30T13:00:00+09:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning();
      await tx.insert(slotWindowMenus).values({
        windowId: window.id,
        menuId: shop.menuId,
        serviceType: 'cut',
        menuName: '커트',
        listPrice: 20000,
        durationMinutes: 60,
        discountRate: 10,
        salePrice: 18000,
      });

      const search = async (text: string) => {
        const query = {
          sigunguCode: '41273',
          filters: EMPTY_FILTERS,
          keyword: parseSearchKeyword(text),
          customerId: null,
          now: NOW,
        };
        const result = await selectSlotPage(tx, {
          ...query,
          origin: TEST_LOCATION,
          sort: 'imminent',
          cursor: null,
          shopId: null,
        });
        return { ids: ids(result.items), total: await countListItems(tx, query) };
      };

      expect(await search('시간대')).toEqual({ ids: [window.id], total: 1 });
      expect(await search('다른샵')).toEqual({ ids: [], total: 0 });
    });
  });

  it('정렬: 할인율순은 높은 순, 임박순은 빠른 순, 거리순은 가까운 순', async () => {
    await withRollback(async (tx) => {
      const near = await createTestShop(tx, { status: 'approved' });
      const farther = await createTestShop(tx, {
        status: 'approved',
        location: { lat: TEST_LOCATION.lat + 0.005, lng: TEST_LOCATION.lng },
      });
      const a = await insertSlot(tx, farther, '09:00', '10:00', {
        discountRate: 50,
        salePrice: 10000,
      });
      const b = await insertSlot(tx, near, '11:00', '12:00', {
        discountRate: 10,
        salePrice: 18000,
      });

      expect(ids((await page(tx, { sort: 'discount' })).items)).toEqual([a.id, b.id]);
      expect(ids((await page(tx, { sort: 'imminent' })).items)).toEqual([a.id, b.id]);
      const byDistance = (await page(tx, { sort: 'near' })).items;
      expect(ids(byDistance)).toEqual([b.id, a.id]);
      expect(byDistance[0].distanceMeters).toBeLessThan(1);
      expect(byDistance[1].distanceMeters).toBeGreaterThan(500);
    });
  });

  it('거리순: 거리가 같은 두 샵도 섞이지 않고 샵끼리, 같은 샵 안은 시작이 빠른 순(11/18 정찬형)', async () => {
    await withRollback(async (tx) => {
      // 같은 자리(같은 거리)의 두 샵. 샵 id 순서로 모인다
      const one = await createTestShop(tx, { status: 'approved' });
      const two = await createTestShop(tx, { status: 'approved' });
      const [first, second] = one.shopId < two.shopId ? [one, two] : [two, one];
      const a = await insertSlot(tx, second, '09:00', '10:00');
      const b = await insertSlot(tx, first, '15:00', '16:00');
      const c = await insertSlot(tx, first, '11:00', '12:00');
      const d = await insertSlot(tx, second, '13:00', '14:00');

      const result = await page(tx, { sort: 'near' });
      expect(ids(result.items)).toEqual([c.id, b.id, a.id, d.id]);
    });
  });

  it('20개씩 커서로 이어 불러오면 빠지거나 겹치는 매물이 없다(같은 거리끼리도)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const all: string[] = [];
      // 같은 샵 30분 매물 25개: 00:00 ~ 12:30
      for (let i = 0; i < SLOT_PAGE_SIZE + 5; i += 1) {
        const hm = (minutes: number) =>
          `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        all.push((await insertSlot(tx, shop, hm(i * 30), hm(i * 30 + 30))).id);
      }
      // 시작 전이어야 하므로 지금은 10/31
      for (const sort of ['near', 'discount', 'imminent'] as const) {
        const first = await page(tx, { sort });
        expect(first.items).toHaveLength(SLOT_PAGE_SIZE);
        expect(first.nextCursor).not.toBeNull();
        const second = await page(tx, { sort, cursor: first.nextCursor });
        expect(second.items).toHaveLength(5);
        expect(second.nextCursor).toBeNull();
        const seen = [...ids(first.items), ...ids(second.items)];
        expect(new Set(seen).size).toBe(all.length);
        expect([...seen].sort()).toEqual([...all].sort());
      }
      // 임박순은 시작 시각 순서 그대로. 거리순도 한 샵이라 시작 시각 순서 그대로(11/18), 다음 장도 이어서
      const imminent = await page(tx, { sort: 'imminent' });
      expect(ids(imminent.items)).toEqual(all.slice(0, SLOT_PAGE_SIZE));
      const nearFirst = await page(tx, { sort: 'near' });
      const nearSecond = await page(tx, { sort: 'near', cursor: nearFirst.nextCursor });
      expect([...ids(nearFirst.items), ...ids(nearSecond.items)]).toEqual(all);
    });
  });

  it('고른 샵 매물만, 배지는 서버 시각으로(내 홀딩은 결제 중 배지 없음)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const someone = await createTestCustomer(tx);
      const now = new Date('2026-11-01T06:00:00+09:00');
      const holdExpiresAt = new Date('2026-11-01T06:05:00+09:00');

      // 시작 3시간 전: 임박·환불 불가. 다른 고객이 홀딩 중
      const soon = await insertSlot(tx, shop, '09:00', '10:00', {
        holdCustomerId: someone.customerId,
        holdExpiresAt,
      });
      // 시작 12시간 전, 내가 홀딩 중, 신규 고객 전용
      const later = await insertSlot(tx, shop, '18:00', '19:00', {
        holdCustomerId: me.customerId,
        holdExpiresAt,
        newCustomerOnly: true,
      });
      await insertSlot(tx, other, '09:00', '10:00');

      const result = await page(tx, {
        sort: 'imminent',
        shopId: shop.shopId,
        customerId: me.customerId,
        now,
      });
      expect(ids(result.items)).toEqual([soon.id, later.id]);
      expect(result.items[0].badges).toEqual(['nonRefundable', 'imminent', 'onHold']);
      // 신규 고객 전용 배지는 고객 화면에 보여 주지 않는다(#459). 매물은 신규 고객인 나에게 보인다
      expect(result.items[1].badges).toEqual([]);
    });
  });
});
