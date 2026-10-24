// DB 테스트에서 같이 쓰는 데이터 만들기 (docs/tech-guide.md 3-4 "DB 테스트").
// withRollback 안에서 부른다. 만든 데이터는 테스트가 끝나면 되돌려진다.

import { authUsers } from 'drizzle-orm/supabase';

import { customers, menus, owners, profiles, shops, slots } from '@/db/schema';

import type { TestTx } from './test-db';

/** 가짜 샵 위치(안산시청 근처) */
export const TEST_LOCATION = { lng: 126.8308, lat: 37.3219 };

/** 로그인 정보(auth.users)와 profiles 한 줄. 돌려주는 값은 profiles.id(= auth.users.id) */
export async function createTestUser(tx: TestTx) {
  const userId = crypto.randomUUID();
  await tx.insert(authUsers).values({ id: userId });
  await tx.insert(profiles).values({ id: userId, email: `${userId}@test.invalid` });
  return userId;
}

/** 고객 계정. 홀딩·예약 테스트에 쓴다 */
export async function createTestCustomer(tx: TestTx) {
  const userId = await createTestUser(tx);
  const [customer] = await tx
    .insert(customers)
    .values({ userId, nickname: '테스트 고객' })
    .returning();
  return { userId, customerId: customer.id };
}

/**
 * 원장님 계정 → 샵 → 메뉴(커트 20,000원 60분)를 만들고 매물에 필요한 id를 돌려준다.
 * 샵 상태 등 바꿀 값은 shop으로 넘긴다. 예: createTestShop(tx, { status: 'approved' })
 */
export async function createTestShop(tx: TestTx, shop: Partial<typeof shops.$inferInsert> = {}) {
  const userId = await createTestUser(tx);
  const [owner] = await tx
    .insert(owners)
    .values({ userId, name: '테스트 원장', phone: '000-0000-0000' })
    .returning();
  const [row] = await tx
    .insert(shops)
    .values({
      ownerId: owner.id,
      name: '테스트 미용실',
      category: 'hair',
      phone: '000-0000-0000',
      roadAddress: '경기 안산시 단원구 테스트로 1',
      sido: '경기',
      sigungu: '안산시 단원구',
      sigunguCode: '41273',
      location: TEST_LOCATION,
      businessName: '테스트 미용실',
      representativeName: '테스트 원장',
      businessRegistrationNumber: '000-00-00000',
      openedOn: '2026-01-01',
      businessDocPath: 'test/business-doc.pdf',
      ...shop,
    })
    .returning();
  const [menu] = await tx
    .insert(menus)
    .values({
      shopId: row.id,
      serviceType: 'cut',
      name: '커트',
      listPrice: 20000,
      durationMinutes: 60,
      sortOrder: 0,
    })
    .returning();
  return { shopId: row.id, menuId: menu.id, createdBy: userId };
}

export type TestShop = Awaited<ReturnType<typeof createTestShop>>;

/** 매물 한 건의 값(넣지는 않는다). 시각은 'HH:MM'(2026-11-01, 한국 시간). 기본은 게시중·30% 할인 */
export function testSlot(
  ids: TestShop,
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
