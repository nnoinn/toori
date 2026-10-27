// DB 테스트에서 같이 쓰는 데이터 만들기 (docs/tech-guide.md 3-4 "DB 테스트").
// withRollback 안에서 부른다. 만든 데이터는 테스트가 끝나면 되돌려진다.

import { authUsers } from 'drizzle-orm/supabase';

import {
  customers,
  menus,
  orders,
  owners,
  profiles,
  type ReservationStatus,
  reservations,
  shops,
  type SlotStatus,
  slots,
} from '@/db/schema';
import { SLOT_START_STEP_MINUTES } from '@/server/policy';

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

/**
 * 매물 한 건의 값(넣지는 않는다). 시각은 'HH:MM'(2026-11-01, 한국 시간). 기본은 게시중·30% 할인.
 * 소요 시간은 끝 − 시작이다(D10). 시작 시각과 소요 시간이 정책 단위(#108, 30분)가 아니면 멈춘다
 */
export function testSlot(
  ids: TestShop,
  start: string,
  end: string,
  extra: Partial<typeof slots.$inferInsert> = {},
) {
  const at = (hm: string) => new Date(`2026-11-01T${hm}:00+09:00`);
  const minutesOf = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + m;
  };
  const durationMinutes = minutesOf(end) - minutesOf(start);
  // TODO(#108): 강규민의 MENU_DURATION_STEP_MINUTES가 생기면 소요 시간은 그 값으로 확인한다
  if (
    minutesOf(start) % SLOT_START_STEP_MINUTES !== 0 ||
    durationMinutes % SLOT_START_STEP_MINUTES !== 0
  ) {
    throw new Error(
      `testSlot: 매물 시작 시각과 소요 시간은 ${SLOT_START_STEP_MINUTES}분 단위로 넣어요(#108). 받은 값 ${start}~${end}`,
    );
  }
  return {
    ...ids,
    serviceType: 'cut',
    menuName: '커트',
    listPrice: 20000,
    durationMinutes,
    discountRate: 30,
    salePrice: 14000,
    startAt: at(start),
    endAt: at(end),
    publishAt: new Date('2026-10-30T10:00:00+09:00'),
    status: 'published',
    ...extra,
  } satisfies typeof slots.$inferInsert;
}

/** 예약 상태에 맞는 매물 상태(확정 → 예약됨, 이용 완료 → 완료, 취소 → 취소) */
const SLOT_STATUS_OF = {
  confirmed: 'reserved',
  completed: 'completed',
  cancelled: 'cancelled',
} as const satisfies Record<ReservationStatus, SlotStatus>;

/**
 * 매물 → 주문(결제 완료) → 예약 한 벌. 매물 상태는 예약 상태에 맞춘다. 시각은 testSlot과 같은 'HH:MM'.
 * 노쇼·취소 시각 등 예약에 더 넣을 값은 reservation으로 넘긴다.
 * 예: createTestReservation(tx, shop, customerId, '09:00', '10:00', 'completed', { visitResult: 'no_show' })
 */
export async function createTestReservation(
  tx: TestTx,
  shop: TestShop,
  customerId: string,
  start: string,
  end: string,
  status: ReservationStatus,
  reservation: Partial<typeof reservations.$inferInsert> = {},
) {
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, { status: SLOT_STATUS_OF[status] }))
    .returning();
  const [order] = await tx
    .insert(orders)
    .values({
      paymentId: `test_${crypto.randomUUID()}`,
      slotId: slot.id,
      customerId,
      salePrice: slot.salePrice,
      amount: slot.salePrice,
      refundPolicyVersion: 'test',
      refundPolicyAgreedAt: new Date('2026-10-30T10:00:00+09:00'),
      status: 'confirmed',
      paidAt: new Date('2026-10-30T10:05:00+09:00'),
    })
    .returning();
  // 예약 번호는 유일해야 해서, 여러 테스트 파일이 동시에 돌아도 겹치지 않게 무작위로 만든다
  const [row] = await tx
    .insert(reservations)
    .values({
      code: `T${crypto.randomUUID().slice(0, 8)}`,
      slotId: slot.id,
      orderId: order.id,
      customerId,
      status,
      ...reservation,
    })
    .returning();
  return { slot, order, reservation: row };
}
