// 원장님 대시보드 조회가 그 샵의 오늘 이후 매물과 "처리 필요" 예약만 고르는지 실제 DB로 본다(O9, S-401, #21 Q12).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import { slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  testSlot,
} from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectDashboardSlots, selectNeedsVisitRecord } from './dashboard-store';

afterAll(closeTestDb);

// 매물 날짜는 2026-11-01(testSlot). 그날 0시부터 본다
const from = new Date('2026-11-01T00:00:00+09:00');

describeDb('원장님 대시보드 조회 (실제 DB)', () => {
  it('그 샵의 from 이후 매물을 시작 순서로, 예약된 매물은 예약번호와 같이', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      await tx.insert(slots).values([
        testSlot(shop, '15:00', '16:00'),
        testSlot(shop, '09:00', '10:00', { status: 'closed', closeReason: 'mistake' }),
        // 전날 매물: 빠진다
        testSlot(shop, '10:00', '11:00', {
          startAt: new Date('2026-10-31T10:00:00+09:00'),
          endAt: new Date('2026-10-31T11:00:00+09:00'),
        }),
        testSlot(other, '12:00', '13:00'),
      ]);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '11:00',
        '12:00',
        'confirmed',
      );

      const rows = await selectDashboardSlots(tx, shop.shopId, from);
      expect(rows.map((row) => [row.startAt, row.status, row.reservationCode])).toEqual([
        [new Date('2026-11-01T09:00:00+09:00').toISOString(), 'closed', null],
        [new Date('2026-11-01T11:00:00+09:00').toISOString(), 'reserved', reservation.code],
        [new Date('2026-11-01T15:00:00+09:00').toISOString(), 'published', null],
      ]);
    });
  });

  it('처리 필요: 시작이 지났고 방문·노쇼 기록이 없는 예정 예약만', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const other = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const need = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      // 방문 완료 기록이 있으면 빠진다
      await createTestReservation(tx, shop, customer.customerId, '10:00', '11:00', 'confirmed', {
        visitResult: 'visited',
        visitRecordedAt: new Date('2026-11-01T11:00:00+09:00'),
      });
      // 취소된 예약, 아직 시작 전 예약, 다른 샵 예약도 빠진다
      await createTestReservation(tx, shop, customer.customerId, '11:00', '12:00', 'cancelled');
      await createTestReservation(tx, shop, customer.customerId, '15:00', '16:00', 'confirmed');
      await createTestReservation(tx, other, customer.customerId, '09:00', '10:00', 'confirmed');

      const now = new Date('2026-11-01T13:00:00+09:00');
      const rows = await selectNeedsVisitRecord(tx, shop.shopId, now);
      expect(rows.map((row) => row.reservationCode)).toEqual([need.reservation.code]);
    });
  });
});
