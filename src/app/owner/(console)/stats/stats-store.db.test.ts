// 원장님 월별 통계(S-504)의 살린 시간이 그 샵의 그 달 방문 완료 예약만 방문 처리일(한국 날짜)마다 세는지 실제 DB로 본다.
// 기준은 11/20 정민석 결정: 방문 완료만(노쇼·취소·무효 제외), 방문 처리 시각이 그 달 안(정산 내역과 같은 기준).
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { afterAll, expect, it } from 'vitest';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { kstMonthBounds } from './stats';
import { selectVisitDays } from './stats-store';

afterAll(closeTestDb);

/** 'YYYY-MM-DD HH:MM'(한국 시간) */
const kst = (value: string) => new Date(`${value.replace(' ', 'T')}:00+09:00`);

const NOVEMBER = kstMonthBounds('2026-11');

describeDb('월별 통계 살린 시간 (S-504)', () => {
  it('방문 완료로 처리한 예약의 시술 시간만 방문 처리일(한국 날짜)마다 더하고, 노쇼·취소·무효·다른 달·다른 샵은 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const other = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const visited = (at: string) => ({
        visitResult: 'visited' as const,
        visitRecordedAt: kst(at),
      });

      // 센다(매물은 모두 11/1): 90분은 11/1, 60분은 한국 시간 11/2 0시 30분(UTC로는 11/1)이라 11/2, 60분은 11/30
      await createTestReservation(tx, shop, customerId, '09:00', '10:30', 'completed', {
        ...visited('2026-11-01 11:00'),
      });
      await createTestReservation(tx, shop, customerId, '11:00', '12:00', 'completed', {
        ...visited('2026-11-02 00:30'),
      });
      await createTestReservation(tx, shop, customerId, '12:30', '13:30', 'completed', {
        ...visited('2026-11-30 23:30'),
      });
      // 빼야 하는 것: 노쇼, 고객 취소, 무효로 한 방문 완료, 12/1 0시에 처리한 방문 완료, 다른 샵
      await createTestReservation(tx, shop, customerId, '14:00', '15:00', 'completed', {
        visitResult: 'no_show',
        visitRecordedAt: kst('2026-11-01 15:30'),
      });
      await createTestReservation(tx, shop, customerId, '15:30', '16:30', 'cancelled', {
        cancelledAt: kst('2026-10-31 10:00'),
        cancelActor: 'customer',
      });
      await createTestReservation(tx, shop, customerId, '17:00', '18:00', 'completed', {
        ...visited('2026-11-01 18:30'),
        voidedAt: kst('2026-11-02 10:00'),
      });
      await createTestReservation(tx, shop, customerId, '18:30', '19:30', 'completed', {
        ...visited('2026-12-01 00:00'),
      });
      await createTestReservation(tx, other, customerId, '09:00', '10:00', 'completed', {
        ...visited('2026-11-01 11:00'),
      });

      expect(await selectVisitDays(tx, shop.shopId, NOVEMBER)).toEqual([
        { dateKey: '2026-11-01', visitCount: 1, minutes: 90 },
        { dateKey: '2026-11-02', visitCount: 1, minutes: 60 },
        { dateKey: '2026-11-30', visitCount: 1, minutes: 60 },
      ]);
    });
  });

  it('같은 날 여러 번 방문 완료면 한 줄로 더하고, 방문 완료가 없으면 빈 목록', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const empty = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      for (const [start, end, at] of [
        ['09:00', '10:00', '2026-11-01 10:30'],
        ['10:30', '12:00', '2026-11-01 12:30'],
      ] as const) {
        await createTestReservation(tx, shop, customerId, start, end, 'completed', {
          visitResult: 'visited',
          visitRecordedAt: kst(at),
        });
      }

      expect(await selectVisitDays(tx, shop.shopId, NOVEMBER)).toEqual([
        { dateKey: '2026-11-01', visitCount: 2, minutes: 150 },
      ]);
      expect(await selectVisitDays(tx, empty.shopId, NOVEMBER)).toEqual([]);
    });
  });
});
