// 원장님 예약 상세 조회가 그 샵 예약만 예약자 정보와 같이 읽는지 실제 DB로 본다(O11, S-403, X-102).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectOwnerReservation } from './reservation-detail-store';

afterAll(closeTestDb);

describeDb('원장님 예약 상세 조회 (실제 DB)', () => {
  it('그 샵 예약을 매물·예약자 정보와 같이 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx
        .update(customers)
        .set({ phone: '010-1234-5678' })
        .where(eq(customers.id, customer.customerId));
      const { slot, reservation } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '14:00',
        '15:00',
        'confirmed',
      );

      const found = await selectOwnerReservation(tx, shop.shopId, reservation.id);
      expect(found).toEqual({
        id: reservation.id,
        code: reservation.code,
        status: 'confirmed',
        visitResult: null,
        visitRecordedAt: null,
        cancelledAt: null,
        cancelActor: null,
        createdAt: reservation.createdAt,
        slotId: slot.id,
        startAt: slot.startAt,
        endAt: slot.endAt,
        serviceType: slot.serviceType,
        menuName: slot.menuName,
        durationMinutes: slot.durationMinutes,
        listPrice: slot.listPrice,
        discountRate: slot.discountRate,
        salePrice: slot.salePrice,
        newCustomerOnly: slot.newCustomerOnly,
        customerNickname: '테스트 고객',
        customerPhone: '010-1234-5678',
      });
    });
  });

  it('취소된 예약은 취소 기록과 같이 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const cancelledAt = new Date('2026-10-31T10:00:00+09:00');
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '14:00',
        '15:00',
        'cancelled',
        { cancelledAt, cancelActor: 'customer' },
      );

      const found = await selectOwnerReservation(tx, shop.shopId, reservation.id);
      expect(found).toMatchObject({ status: 'cancelled', cancelledAt, cancelActor: 'customer' });
    });
  });

  it('다른 샵 예약, 없는 id, 모양이 틀린 id는 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        other,
        customer.customerId,
        '14:00',
        '15:00',
        'confirmed',
      );

      expect(await selectOwnerReservation(tx, shop.shopId, reservation.id)).toBeNull();
      expect(await selectOwnerReservation(tx, shop.shopId, crypto.randomUUID())).toBeNull();
      expect(await selectOwnerReservation(tx, shop.shopId, 'not-a-uuid')).toBeNull();
    });
  });
});
