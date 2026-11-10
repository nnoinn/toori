// 새 매물 알림(slot.digest)의 고객·매물 고르기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (C-601·C-209, W17 ②).
// 매물 시각은 2026-11-01 한국 시간이다(tests/db/fixtures.ts).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import {
  favorites,
  interestAreas,
  notifications,
  pushSubscriptions,
  slots,
  termsAgreements,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { digestDedupeKey, readDigestCustomers, readDigestSlots } from './digest-store';

/** 11/1 13:00(한국 시간) */
const NOW = new Date('2026-11-01T13:00:00+09:00');
const SINCE = new Date('2026-10-31T13:00:00+09:00');
const DATE_KEY = '2026-11-01';
/** 24시간 안에 게시된 매물 */
const FRESH = { publishAt: new Date('2026-11-01T09:00:00+09:00') };

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];
type Reader = Parameters<typeof readDigestCustomers>[0];

/** 동의·고객 알림 기기·관심 동네(단원구, 테스트 샵 동네)를 다 갖춘 고객 */
async function readyCustomer(tx: Tx, options: { area?: boolean } = {}) {
  const customer = await createTestCustomer(tx);
  await tx.insert(termsAgreements).values({
    userId: customer.userId,
    accountType: 'customer',
    termsType: 'interest_alert',
    version: 'test',
  });
  await tx.insert(pushSubscriptions).values({
    userId: customer.userId,
    accountType: 'customer',
    endpoint: `https://push.example/${customer.userId}`,
    p256dh: 'p',
    auth: 'a',
  });
  if (options.area !== false) {
    await tx
      .insert(interestAreas)
      .values({ customerId: customer.customerId, sigunguCode: '41273' });
  }
  return customer;
}

describeDb('새 매물 알림 고르기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('동의·알림 기기·관심 동네나 찜이 있고 오늘 아직 받지 않은 고객만 고른다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Reader;
      const ready = await readyCustomer(tx);
      const favoriteOnly = await readyCustomer(tx, { area: false });
      const shop = await createTestShop(tx, { status: 'approved' });
      await tx
        .insert(favorites)
        .values({ customerId: favoriteOnly.customerId, shopId: shop.shopId });
      const nothing = await readyCustomer(tx, { area: false });
      const withdrawn = await readyCustomer(tx);
      await tx
        .update(termsAgreements)
        .set({ withdrawnAt: NOW })
        .where(eq(termsAgreements.userId, withdrawn.userId));
      const marketingOnly = await createTestCustomer(tx);
      await tx.insert(termsAgreements).values({
        userId: marketingOnly.userId,
        accountType: 'customer',
        termsType: 'marketing',
        version: 'test',
      });
      await tx
        .insert(interestAreas)
        .values({ customerId: marketingOnly.customerId, sigunguCode: '41273' });
      const ownerDeviceOnly = await readyCustomer(tx);
      await tx
        .update(pushSubscriptions)
        .set({ accountType: 'owner' })
        .where(eq(pushSubscriptions.userId, ownerDeviceOnly.userId));
      const sentToday = await readyCustomer(tx);
      await tx.insert(notifications).values({
        userId: sentToday.userId,
        accountType: 'customer',
        event: 'slot.digest',
        dedupeKey: digestDedupeKey(sentToday.customerId, DATE_KEY),
        channel: 'web_push',
        payload: {},
        status: 'sent',
      });

      const picked = (await readDigestCustomers(db, { dateKey: DATE_KEY, limit: 50 })).map(
        (c) => c.customerId,
      );
      expect(picked).toEqual(expect.arrayContaining([ready.customerId, favoriteOnly.customerId]));
      for (const left of [nothing, withdrawn, marketingOnly, ownerDeviceOnly, sentToday]) {
        expect(picked).not.toContain(left.customerId);
      }
    });
  });

  it('관심 동네·찜한 샵의 새로 게시된 매물만, 같은 매물은 한 번, 고객 목록과 같은 조건으로 고른다', async () => {
    await withRollback(async (tx) => {
      const db = tx as unknown as Reader;
      const { customerId } = await readyCustomer(tx);
      const danwon = await createTestShop(tx, { status: 'approved' });
      const sangnok = await createTestShop(tx, {
        status: 'approved',
        sigungu: '안산시 상록구',
        sigunguCode: '41271',
      });
      const favoriteSangnok = await createTestShop(tx, {
        status: 'approved',
        sigungu: '안산시 상록구',
        sigunguCode: '41271',
      });
      const pending = await createTestShop(tx, { status: 'pending' });
      await tx.insert(favorites).values([
        { customerId, shopId: favoriteSangnok.shopId },
        { customerId, shopId: danwon.shopId },
      ]);
      // 단원구 샵에 이용 이력을 만든다(신규 고객 전용 매물이 안 보여야 한다)
      await createTestReservation(tx, danwon, customerId, '09:00', '10:00', 'completed');

      const [areaAndFavorite, favoriteOnly] = await tx
        .insert(slots)
        .values([
          testSlot(danwon, '15:00', '16:00', FRESH),
          testSlot(favoriteSangnok, '15:00', '16:00', {
            publishAt: new Date('2026-11-01T10:00:00+09:00'),
            discountRate: 40,
            salePrice: 12000,
          }),
        ])
        .returning({ id: slots.id });
      await tx.insert(slots).values([
        testSlot(danwon, '16:00', '17:00'), // 24시간 전에 게시됨
        testSlot(danwon, '17:00', '18:00', { ...FRESH, newCustomerOnly: true }), // 이력 있는 샵의 신규 고객 전용
        testSlot(danwon, '18:00', '19:00', {
          status: 'scheduled',
          publishAt: new Date('2026-11-01T14:00:00+09:00'),
        }), // 아직 게시 전
        testSlot(danwon, '12:00', '12:30', FRESH), // 이미 시작함
        testSlot(sangnok, '15:00', '16:00', FRESH), // 관심 동네도 찜도 아님
        testSlot(pending, '15:00', '16:00', FRESH), // 승인 전 샵
      ]);

      const picked = await readDigestSlots(db, { customerId, since: SINCE, now: NOW });
      expect(picked).toEqual([
        expect.objectContaining({
          slotId: areaAndFavorite.id,
          sigunguCode: '41273',
          sigungu: '안산시 단원구',
          discountRate: 30,
          inArea: true,
          favorite: true,
        }),
        expect.objectContaining({
          slotId: favoriteOnly.id,
          sigunguCode: '41271',
          discountRate: 40,
          inArea: false,
          favorite: true,
        }),
      ]);
    });
  });
});
