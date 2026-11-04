// 내 노쇼 기록이 본인 노쇼만 세고, 가장 최근 것을 돌려주는지 실제 DB로 본다(C-105, X-102).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectMyNoShows } from './no-show-history';

afterAll(closeTestDb);

describeDb('내 노쇼 기록', () => {
  it('본인 노쇼만 세고, 시작 시각이 가장 늦은 것을 최근 노쇼로 돌려준다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);

      await createTestReservation(tx, shop, me.customerId, '09:00', '10:00', 'completed', {
        visitResult: 'no_show',
      });
      const { reservation: later } = await createTestReservation(
        tx,
        shop,
        me.customerId,
        '13:00',
        '14:00',
        'completed',
        { visitResult: 'no_show' },
      );
      // 방문 완료, 처리 전, 예정, 취소는 세지 않는다
      await createTestReservation(tx, shop, me.customerId, '11:00', '12:00', 'completed', {
        visitResult: 'visited',
      });
      await createTestReservation(tx, shop, me.customerId, '15:00', '16:00', 'completed');
      await createTestReservation(tx, shop, me.customerId, '17:00', '18:00', 'confirmed');
      await createTestReservation(tx, shop, me.customerId, '19:00', '20:00', 'cancelled');
      // 다른 고객의 노쇼도 세지 않는다
      await createTestReservation(tx, shop, other.customerId, '21:00', '22:00', 'completed', {
        visitResult: 'no_show',
      });

      const history = await selectMyNoShows(tx, me.customerId);
      expect(history.count).toBe(2);
      expect(history.latest?.reservationId).toBe(later.id);
      expect(history.latest?.startAt).toBe(new Date('2026-11-01T13:00:00+09:00').toISOString());
    });
  });

  it('노쇼가 없으면 0회, 최근 노쇼 없음', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      await createTestReservation(tx, shop, me.customerId, '09:00', '10:00', 'completed', {
        visitResult: 'visited',
      });

      expect(await selectMyNoShows(tx, me.customerId)).toEqual({ count: 0, latest: null });
    });
  });
});
