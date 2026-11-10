// 리마인드를 보낼 예약 고르기를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (C-602, W17 ①).
// 매물 시각은 2026-11-01 한국 시간이다(tests/db/fixtures.ts).

import { afterAll, expect, it } from 'vitest';

import { notifications } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../tests/db/test-db';
import { readDueReminders, reminderDedupeKey } from './reminder-store';

/** 11/1 13:00(한국 시간) */
const NOW = new Date('2026-11-01T13:00:00+09:00');
/** 리마인드 때보다 한참 전에 확정된 예약 */
const BOOKED_EARLY = { createdAt: new Date('2026-10-30T10:05:00+09:00') };

type Tx = Parameters<Parameters<typeof withRollback>[0]>[0];

function due(tx: Tx, minutes: number, nextMinutes: number) {
  const db = tx as unknown as Parameters<typeof readDueReminders>[0];
  return readDueReminders(db, { minutes, nextMinutes, now: NOW, limit: 50 });
}

describeDb('리마인드 보낼 예약 고르기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('시작까지 남은 시간이 리마인드 구간에 든 예정 예약만, 시작이 빠른 것부터 고른다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId, userId } = await createTestCustomer(tx);
      const book = (start: string, end: string, status: 'confirmed' | 'cancelled' = 'confirmed') =>
        createTestReservation(tx, shop, customerId, start, end, status, BOOKED_EARLY);
      const at1500 = await book('15:00', '15:30'); // 2시간 뒤: 2시간 전 구간
      const at1400 = await book('14:00', '14:30'); // 1시간 뒤: 2시간 전 구간
      await book('15:30', '16:00'); // 2시간 30분 뒤: 아직
      const at1300 = await book('13:00', '13:30'); // 지금 시작: 지남
      await book('14:30', '15:00', 'cancelled'); // 취소됨

      const twoHours = await due(tx, 120, 15);
      expect(twoHours.map((r) => r.reservationId)).toEqual([
        at1400.reservation.id,
        at1500.reservation.id,
      ]);
      expect(twoHours[0]).toMatchObject({
        customerUserId: userId,
        shopName: '테스트 미용실',
        startAt: new Date('2026-11-01T14:00:00+09:00'),
      });
      expect((await due(tx, 15, 0)).map((r) => r.reservationId)).not.toContain(
        at1300.reservation.id,
      );
    });
  });

  it('15분 전 구간에 들면 2시간 전 리마인드는 고르지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      // 13:00 기준 시작 시각은 30분 단위라, 30분 뒤가 가장 가깝다. 15분 전 구간을 보려고 now를 13:20으로 옮긴다
      const soon = await createTestReservation(
        tx,
        shop,
        customerId,
        '13:30',
        '14:30',
        'confirmed',
        BOOKED_EARLY,
      );
      const db = tx as unknown as Parameters<typeof readDueReminders>[0];
      const now = new Date('2026-11-01T13:20:00+09:00');
      expect(await readDueReminders(db, { minutes: 120, nextMinutes: 15, now, limit: 50 })).toEqual(
        [],
      );
      expect(
        (await readDueReminders(db, { minutes: 15, nextMinutes: 0, now, limit: 50 })).map(
          (r) => r.reservationId,
        ),
      ).toEqual([soon.reservation.id]);
    });
  });

  it('리마인드 때가 지난 뒤 확정된 예약과 이미 보낸 리마인드는 뺀다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId, userId } = await createTestCustomer(tx);
      // 14:30 시작인데 13:00에 확정: 2시간 전(12:30)이 지난 뒤라 2시간 전 리마인드 없음
      await createTestReservation(tx, shop, customerId, '14:30', '15:00', 'confirmed', {
        createdAt: new Date('2026-11-01T13:00:00+09:00'),
      });
      const sent = await createTestReservation(
        tx,
        shop,
        customerId,
        '15:00',
        '15:30',
        'confirmed',
        BOOKED_EARLY,
      );
      await tx.insert(notifications).values({
        userId,
        accountType: 'customer',
        event: 'reservation.reminder',
        dedupeKey: reminderDedupeKey(120, sent.reservation.id),
        channel: 'web_push',
        payload: {},
        status: 'sent',
      });
      expect(await due(tx, 120, 15)).toEqual([]);
    });
  });
});
