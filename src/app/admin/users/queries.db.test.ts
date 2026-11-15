// 회원 조회(A-102)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 검색, 예약·취소·노쇼 수, 원장님 샵·매물 수, 고객 상세를 본다. 시드와 섞이지 않게 내가 만든 줄만 비교한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers, owners, profiles, shops, slots, termsAgreements } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { selectCustomerDetail, selectCustomers, selectOwners } from './queries';

/** 다른 테스트와 겹치지 않는 값 */
const unique = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;

/** 닉네임·연락처를 정한 고객. 이름은 닉네임 앞에 "이름"을 붙여서 따로 둔다 */
async function namedCustomer(tx: TestTx, nickname: string, phone: string | null = null) {
  const customer = await createTestCustomer(tx);
  await tx
    .update(customers)
    .set({ name: `이름${nickname}`, nickname, phone })
    .where(eq(customers.id, customer.customerId));
  return customer;
}

describeDb('회원 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('고객을 이름 일부, 닉네임 일부, 이메일 일부, 휴대폰 전체 번호로 찾고, 목록에 이름과 닉네임을 따로 준다', async () => {
    await withRollback(async (tx) => {
      const nickname = unique('찾는고객');
      const phone = '010-9876-5432';
      const me = await namedCustomer(tx, nickname, phone);
      const other = await namedCustomer(tx, unique('다른고객'));
      const email = unique('find-me-');
      await tx
        .update(profiles)
        .set({ email: `${email}@test.invalid` })
        .where(eq(profiles.id, me.userId));

      const ids = async (query: string) =>
        (await selectCustomers(tx, query)).rows.map((row) => row.customerId);

      expect(await ids(nickname.slice(0, 8))).toContain(me.customerId);
      expect(await ids(nickname.slice(0, 8))).not.toContain(other.customerId);
      // 예약자 이름(#375)으로도 찾는다. 닉네임에는 없는 "이름"을 붙인 검색어
      expect(await ids(`이름${nickname}`)).toEqual([me.customerId]);
      const [row] = (await selectCustomers(tx, `이름${nickname}`)).rows;
      expect(row).toMatchObject({ name: `이름${nickname}`, nickname });
      expect(await ids(email)).toEqual([me.customerId]);
      expect(await ids('01098765432')).toContain(me.customerId);
      // 휴대폰은 일부만 맞으면 찾지 않는다
      expect(await ids('9876')).not.toContain(me.customerId);
      // 전체 목록에는 둘 다 있다
      const all = await ids('');
      expect(all).toEqual(expect.arrayContaining([me.customerId, other.customerId]));
    });
  });

  it('검색어의 % _ 는 글자 그대로 찾는다', async () => {
    await withRollback(async (tx) => {
      const me = await namedCustomer(tx, unique('할인_100%고객'));
      const other = await namedCustomer(tx, unique('할인x100y고객'));
      const ids = (await selectCustomers(tx, '할인_100%')).rows.map((row) => row.customerId);
      expect(ids).toContain(me.customerId);
      expect(ids).not.toContain(other.customerId);
    });
  });

  it('고객 목록에 예약·취소·노쇼 수를 센다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const nickname = unique('수세기');
      const me = await namedCustomer(tx, nickname);
      await createTestReservation(tx, shop, me.customerId, '10:00', '11:00', 'confirmed');
      await createTestReservation(tx, shop, me.customerId, '11:00', '12:00', 'cancelled');
      await createTestReservation(tx, shop, me.customerId, '12:00', '13:00', 'completed', {
        visitResult: 'no_show',
      });
      const {
        rows: [row],
      } = await selectCustomers(tx, nickname);
      expect(row).toMatchObject({ reservationCount: 3, cancelCount: 1, noShowCount: 1 });

      const noReservation = unique('예약없음');
      await namedCustomer(tx, noReservation);
      const {
        rows: [empty],
      } = await selectCustomers(tx, noReservation);
      expect(empty).toMatchObject({ reservationCount: 0, cancelCount: 0, noShowCount: 0 });
    });
  });

  it('원장님을 이름·샵 이름으로 찾고 샵 상태와 매물 수를 보여준다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      await createTestReservation(tx, shop, me.customerId, '10:00', '11:00', 'confirmed');
      const shopName = unique('찾는샵');
      const ownerName = unique('찾는원장');
      const [row] = await tx
        .update(shops)
        .set({ name: shopName })
        .where(eq(shops.id, shop.shopId))
        .returning({ ownerId: shops.ownerId });
      await tx.update(owners).set({ name: ownerName }).where(eq(owners.id, row.ownerId));

      for (const query of [shopName, ownerName]) {
        const { rows } = await selectOwners(tx, query);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          ownerId: row.ownerId,
          name: ownerName,
          shopId: shop.shopId,
          shopName,
          shopStatus: 'approved',
          slotCount: 1,
        });
      }
      expect((await selectOwners(tx, unique('없는원장'))).rows).toEqual([]);
    });
  });

  it('매물 수는 결제 없이 비운 시간대 칸(hold_released)을 세지 않고, 그런 칸만 있는 원장님도 목록에 남는다(#308 ④)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const shopName = unique('비운칸샵');
      await tx.update(shops).set({ name: shopName }).where(eq(shops.id, shop.shopId));
      const closed = { status: 'closed' as const };
      await tx
        .insert(slots)
        .values(testSlot(shop, '10:00', '11:00', { ...closed, closeReason: 'hold_released' }));
      expect((await selectOwners(tx, shopName)).rows).toMatchObject([
        { shopId: shop.shopId, slotCount: 0 },
      ]);

      await tx
        .insert(slots)
        .values(testSlot(shop, '12:00', '13:00', { ...closed, closeReason: 'mistake' }));
      expect((await selectOwners(tx, shopName)).rows).toMatchObject([
        { shopId: shop.shopId, slotCount: 1 },
      ]);
    });
  });

  it('고객 상세는 전체 번호·이메일·선택 동의 두 개·최근 예약을 읽고, 없는 고객은 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const nickname = unique('상세');
      const me = await namedCustomer(tx, nickname, '010-1111-2222');
      const { reservation, order, slot } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '10:00',
        '11:00',
        'completed',
        { visitResult: 'no_show' },
      );
      const agreedAt = new Date('2026-10-01T00:00:00Z');
      await tx.insert(termsAgreements).values({
        userId: me.userId,
        accountType: 'customer',
        termsType: 'marketing',
        version: 'test',
        agreedAt,
      });

      const detail = await selectCustomerDetail(tx, me.customerId);
      expect(detail).toMatchObject({
        name: `이름${nickname}`,
        nickname,
        phone: '010-1111-2222',
        email: `${me.userId}@test.invalid`,
        consents: {
          interest_alert: { agreed: false, agreedAt: null, withdrawnAt: null },
          marketing: { agreed: true, agreedAt, withdrawnAt: null },
        },
        reservationCount: 1,
        cancelCount: 0,
        noShowCount: 1,
      });
      expect(detail).not.toHaveProperty('userId');
      expect(detail?.reservations).toEqual([
        {
          reservationId: reservation.id,
          code: reservation.code,
          status: 'completed',
          visitResult: 'no_show',
          shopName: expect.any(String),
          menuName: slot.menuName,
          startAt: slot.startAt,
          amount: order.amount,
        },
      ]);

      expect(await selectCustomerDetail(tx, crypto.randomUUID())).toBeNull();
    });
  });
});
