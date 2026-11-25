// 원장님 화면 권한 점검(docs/security-review.md 3장, X-102): 원장님은 본인 샵·매물·예약만 보고 바꾼다.
// 다른 샵의 샵·메뉴·매물·사진·예약 id를 넣어도 그 샵 데이터가 열리거나 바뀌지 않는지, 로그인 안 함·고객 모드는 막히는지 본다.
// 고객 화면 점검(src/app/(customer)/customer-access.db.test.ts)처럼 화면이 부르는 실제 서버 함수를 테스트 DB에서 부르고,
// 로그인·시각과 요청이 있어야 도는 Next.js 도구(쿠키·헤더·after·refresh)만 가짜로 바꾼다(tests/flows/fakes.ts).
// 주소에 id가 들어가는 화면(예약 상세·매물 수정·다시 올리기)은 로그인한 원장님의 샵 id로 읽고, 찾지 못하면 404(notFound)다.

import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

import { getDb } from '@/db';
import {
  agreedCancelRequests,
  menus,
  payoutAccounts,
  reservations,
  shopImages,
  shops,
  slots,
} from '@/db/schema';

import { selectOwnerReservation } from './(console)/reservations/reservation-detail-store';
import {
  recordReservationVisit,
  requestReservationAgreedCancel,
} from './(console)/reservations/actions';
import { saveBusinessInfo } from './(console)/settings/business/actions';
import {
  deleteShopImage,
  reorderStyleImages,
  saveShopImage,
  saveShopLinks,
  setShopImageMenu,
} from './(console)/settings/images/actions';
import { reorderMenus, saveMenu, setMenuHidden } from './(console)/settings/menu/actions';
import { savePayoutAccount } from './(console)/settings/payout/actions';
import { getCategoryChangeImpact, saveShopProfile } from './(console)/settings/shop/actions';
import { checkSlotEdit, closeSlot, relistSlot, updateSlot } from './(console)/slots/actions';
import { checkSlotDraft, createSlot } from './(console)/slots/new/actions';
import { selectSlotForRelist } from './(console)/slots/relist-store';
import { selectSlotForEdit } from './(console)/slots/slot-edit-store';
import { updateWindowRates } from './(console)/slots/window/actions';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { flow, resetFlow, signIn } from '../../../tests/flows/fakes';

vi.mock('@/db', async () => (await import('../../../tests/flows/fakes')).fakeDb);
vi.mock(
  '@/lib/request-time',
  async () => (await import('../../../tests/flows/fakes')).fakeRequestTime,
);
vi.mock(
  '@/server/supabase/server',
  async () => (await import('../../../tests/flows/fakes')).fakeSupabase,
);
vi.mock('next/headers', async () => (await import('../../../tests/flows/fakes')).fakeNextHeaders);
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  ...(await import('../../../tests/flows/fakes')).fakeNextServer,
}));
vi.mock('@/server/payments/portone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/payments/portone')>()),
  ...(await import('../../../tests/flows/fakes')).fakePortOne,
}));
vi.mock(
  '@/server/notifications/send-web-push',
  async () => (await import('../../../tests/flows/fakes')).fakeWebPush,
);
// 저장한 뒤 화면을 다시 그리는 refresh()·revalidatePath()는 요청 안에서만 돈다. 여기서는 아무것도 하지 않는다
vi.mock('next/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/cache')>()),
  refresh: () => {},
  revalidatePath: () => {},
}));

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);

/**
 * 지금 시각: 11/1(일) 11:00. 손님 예약(createTestReservation)은 11/1 09:00~10:00이라 방문 처리를 할 수 있는 시각이고,
 * 판매 중 매물은 13:00~14:00, 다시 올릴 취소 매물은 15:00~16:00이다
 */
const NOW = kst('2026-11-01T11:00:00');

/** 막지 않았다면 실제로 그 샵을 바꿀 값들 */
const MENU_INPUT = {
  serviceType: 'cut',
  name: '새 메뉴',
  listPrice: '30,000',
  durationMinutes: 60,
  description: '',
};
const SLOT_INPUT = (menuId: string) => ({
  menuId,
  startAt: kst('2026-11-02T12:00:00').toISOString(),
  discountRate: 10,
  newCustomerOnly: false,
});

/** 한 샵과 그 샵의 메뉴·판매 중 매물·취소된 매물·스타일 사진·손님 예약 */
type ShopData = TestShop & {
  slotId: string;
  cancelledSlotId: string;
  imageId: string;
  reservationId: string;
};

async function createShopData(tx: TestTx, customerId: string): Promise<ShopData> {
  const shop = await createTestShop(tx, { status: 'approved' });
  const [slot] = await tx
    .insert(slots)
    .values(testSlot(shop, '13:00', '14:00'))
    .returning();
  const [cancelled] = await tx
    .insert(slots)
    .values(testSlot(shop, '15:00', '16:00', { status: 'cancelled' }))
    .returning();
  const [image] = await tx
    .insert(shopImages)
    .values({
      shopId: shop.shopId,
      kind: 'style',
      storagePath: `shops/${shop.shopId}/style.jpg`,
      sortOrder: 0,
    })
    .returning();
  const booked = await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');
  return {
    ...shop,
    slotId: slot.id,
    cancelledSlotId: cancelled.id,
    imageId: image.id,
    reservationId: booked.reservation.id,
  };
}

/** 그 샵의 지금 값(샵·메뉴·매물·사진·정산 계좌·예약·합의 후 취소 요청). 불러도 하나도 바뀌지 않았는지 본다 */
async function snapshotOf(tx: TestTx, shop: ShopData) {
  return {
    shop: await tx.select().from(shops).where(eq(shops.id, shop.shopId)),
    menus: await tx
      .select()
      .from(menus)
      .where(eq(menus.shopId, shop.shopId))
      .orderBy(asc(menus.id)),
    slots: await tx
      .select()
      .from(slots)
      .where(eq(slots.shopId, shop.shopId))
      .orderBy(asc(slots.id)),
    images: await tx
      .select()
      .from(shopImages)
      .where(eq(shopImages.shopId, shop.shopId))
      .orderBy(asc(shopImages.id)),
    payout: await tx.select().from(payoutAccounts).where(eq(payoutAccounts.shopId, shop.shopId)),
    reservation: await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, shop.reservationId)),
    agreedCancel: await tx
      .select()
      .from(agreedCancelRequests)
      .where(eq(agreedCancelRequests.reservationId, shop.reservationId)),
  };
}

/**
 * 샵 id를 받는 원장님 서버 함수 19개(docs/security-review.md 3장). target 샵의 id와 그 샵의 메뉴·매물·사진 id로 부른다.
 * 값은 막지 않았다면 실제로 그 샵을 바꿀 값이다
 */
function shopCalls(target: ShopData) {
  const { shopId, menuId, slotId, cancelledSlotId, imageId } = target;
  return {
    saveBusinessInfo: () =>
      saveBusinessInfo(shopId, {
        businessName: '바꾼 상호',
        representativeName: '바꾼 대표',
        businessRegistrationNumber: '123-45-67891',
        openedOn: '2024-03-01',
        businessDocPath: '',
      }),
    saveShopImage: () =>
      saveShopImage(shopId, { kind: 'style', path: `shops/${shopId}/new.jpg`, menuId: null }),
    deleteShopImage: () => deleteShopImage(shopId, imageId),
    reorderStyleImages: () => reorderStyleImages(shopId, [imageId]),
    setShopImageMenu: () => setShopImageMenu(shopId, imageId, menuId),
    saveShopLinks: () => saveShopLinks(shopId, { instagramUrl: 'https://instagram.com/toori' }),
    saveMenu: () => saveMenu(shopId, null, MENU_INPUT),
    setMenuHidden: () => setMenuHidden(shopId, menuId, true),
    reorderMenus: () => reorderMenus(shopId, [menuId]),
    savePayoutAccount: () =>
      savePayoutAccount(shopId, {
        bankCode: '088',
        accountNumber: '110-123-456789',
        accountHolder: '바꾼 예금주',
      }),
    getCategoryChangeImpact: () => getCategoryChangeImpact(shopId),
    saveShopProfile: () => saveShopProfile(shopId, { name: '바꾼 샵 이름' }),
    closeSlot: () => closeSlot(shopId, slotId, 'mistake'),
    checkSlotEdit: () => checkSlotEdit(shopId, slotId, SLOT_INPUT(menuId)),
    updateSlot: () => updateSlot(shopId, slotId, SLOT_INPUT(menuId)),
    relistSlot: () => relistSlot(shopId, cancelledSlotId),
    checkSlotDraft: () => checkSlotDraft(shopId, SLOT_INPUT(menuId)),
    createSlot: () => createSlot(shopId, SLOT_INPUT(menuId)),
    updateWindowRates: () => updateWindowRates(shopId, { windowId: slotId, rates: [] }),
  } satisfies Record<string, () => Promise<unknown>>;
}

/** 함수마다 부른 결과. 실패하면 어느 함수가 막지 않았는지 이름과 같이 보인다 */
async function callAll(calls: Record<string, () => Promise<unknown>>) {
  const results: Record<string, unknown> = {};
  for (const [name, call] of Object.entries(calls)) results[name] = await call();
  return results;
}

/** 모든 함수가 같은 실패 코드로 막혔다는 기댓값 */
function allFailWith(calls: Record<string, unknown>, code: string) {
  return Object.fromEntries(
    Object.keys(calls).map((name) => [
      name,
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code }) }),
    ]),
  );
}

describeDb('원장님 화면 권한 점검 (X-102, 실제 DB)', () => {
  beforeEach(() => {
    resetFlow();
  });
  afterAll(closeTestDb);

  it('다른 샵 id로 샵 id를 받는 서버 함수 19개를 부르면 모두 FORBIDDEN이고 그 샵은 하나도 바뀌지 않는다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      flow.now = NOW;
      const customer = await createTestCustomer(tx);
      const mine = await createShopData(tx, customer.customerId);
      const other = await createShopData(tx, customer.customerId);
      const before = await snapshotOf(tx, other);

      signIn(mine.createdBy, 'owner');
      const calls = shopCalls(other);
      expect(await callAll(calls)).toEqual(allFailWith(calls, 'FORBIDDEN'));
      expect(await snapshotOf(tx, other)).toEqual(before);
    });
  });

  it('로그인하지 않았으면 UNAUTHENTICATED, 같은 로그인이어도 고객 모드면 WRONG_MODE로 내 샵 함수도 모두 막는다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      flow.now = NOW;
      const customer = await createTestCustomer(tx);
      const mine = await createShopData(tx, customer.customerId);
      const before = await snapshotOf(tx, mine);
      const calls = shopCalls(mine);

      flow.account = null;
      expect(await callAll(calls)).toEqual(allFailWith(calls, 'UNAUTHENTICATED'));

      signIn(mine.createdBy, 'customer');
      expect(await callAll(calls)).toEqual(allFailWith(calls, 'WRONG_MODE'));

      expect(await snapshotOf(tx, mine)).toEqual(before);
    });
  });

  it('예약 처리(방문·노쇼, 합의 후 취소 요청)는 다른 샵 예약이면 RESERVATION_NOT_FOUND이고 예약은 그대로다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      flow.now = NOW;
      const customer = await createTestCustomer(tx);
      const mine = await createShopData(tx, customer.customerId);
      const other = await createShopData(tx, customer.customerId);
      const before = await snapshotOf(tx, other);

      signIn(mine.createdBy, 'owner');
      expect(await recordReservationVisit(other.reservationId, 'visited')).toMatchObject({
        ok: false,
        error: { code: 'RESERVATION_NOT_FOUND' },
      });
      expect(
        await requestReservationAgreedCancel({
          reservationId: other.reservationId,
          reason: 'style_mismatch',
          reasonText: null,
        }),
      ).toMatchObject({ ok: false, error: { code: 'RESERVATION_NOT_FOUND' } });
      expect(await snapshotOf(tx, other)).toEqual(before);
    });
  });

  it('주소에 다른 샵의 예약·매물 id를 넣으면 예약 상세·매물 수정·다시 올리기 화면이 찾지 못한다(화면은 404)', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      flow.now = NOW;
      const customer = await createTestCustomer(tx);
      const mine = await createShopData(tx, customer.customerId);
      const other = await createShopData(tx, customer.customerId);
      const db = getDb();

      // 화면은 로그인한 원장님의 샵 id(ensureOwnerPage)로 읽는다
      expect(await selectOwnerReservation(db, mine.shopId, other.reservationId)).toBeNull();
      expect(await selectSlotForEdit(db, mine.shopId, other.slotId)).toBeNull();
      expect(await selectSlotForRelist(db, mine.shopId, other.cancelledSlotId)).toBeNull();

      // 같은 id를 그 샵 원장님이 열면 보인다(id가 틀려서 못 찾은 것이 아니다)
      expect(await selectOwnerReservation(db, other.shopId, other.reservationId)).toMatchObject({
        id: other.reservationId,
      });
      expect(await selectSlotForEdit(db, other.shopId, other.slotId)).toMatchObject({
        id: other.slotId,
      });
      expect(await selectSlotForRelist(db, other.shopId, other.cancelledSlotId)).toMatchObject({
        id: other.cancelledSlotId,
      });
    });
  });

  it('내 샵 id에 다른 샵의 메뉴·매물·사진 id를 섞어도 막히고 그 샵은 하나도 바뀌지 않는다', async () => {
    await withRollback(async (tx) => {
      flow.db = tx;
      flow.now = NOW;
      const customer = await createTestCustomer(tx);
      const mine = await createShopData(tx, customer.customerId);
      const other = await createShopData(tx, customer.customerId);
      const before = await snapshotOf(tx, other);
      const { shopId } = mine;

      signIn(mine.createdBy, 'owner');
      const results = await callAll({
        saveMenu: () => saveMenu(shopId, other.menuId, MENU_INPUT),
        setMenuHidden: () => setMenuHidden(shopId, other.menuId, true),
        reorderMenus: () => reorderMenus(shopId, [mine.menuId, other.menuId]),
        deleteShopImage: () => deleteShopImage(shopId, other.imageId),
        reorderStyleImages: () => reorderStyleImages(shopId, [mine.imageId, other.imageId]),
        setShopImageMenu: () => setShopImageMenu(shopId, other.imageId, null),
        setShopImageMenuToOtherMenu: () => setShopImageMenu(shopId, mine.imageId, other.menuId),
        closeSlot: () => closeSlot(shopId, other.slotId, 'mistake'),
        checkSlotEdit: () => checkSlotEdit(shopId, other.slotId, SLOT_INPUT(mine.menuId)),
        updateSlot: () => updateSlot(shopId, other.slotId, SLOT_INPUT(mine.menuId)),
        checkSlotDraft: () => checkSlotDraft(shopId, SLOT_INPUT(other.menuId)),
        createSlot: () => createSlot(shopId, SLOT_INPUT(other.menuId)),
      });
      expect(
        Object.entries(results).filter(([, result]) => (result as { ok: boolean }).ok),
      ).toEqual([]);
      expect(await snapshotOf(tx, other)).toEqual(before);
    });
  });
});
