// 운영자 예약 상세의 합의 후 취소 요청 읽기(X-208)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 그 예약의 요청만 최근 것부터 읽고, 사유·기타 내용·상태·시각을 그대로 준다

import { afterAll, expect, it } from 'vitest';

import { agreedCancelRequests } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import { selectReservationAgreedCancels } from './agreed-cancel-queries';

const at = (hm: string) => new Date(`2026-11-11T${hm}:00+09:00`);
const nextDay = (hm: string) => new Date(`2026-11-12T${hm}:00+09:00`);

describeDb('운영자 예약 상세의 합의 후 취소 요청 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('그 예약의 요청만 최근에 요청한 것부터 읽고, 사유·기타 내용·상태·시각을 그대로 준다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const mine = await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');
      const other = await createTestReservation(
        tx,
        shop,
        customerId,
        '10:00',
        '11:00',
        'confirmed',
      );
      const base = { reservationId: mine.reservation.id, requestedBy: shop.createdBy };
      const [declined, expired, pending] = await tx
        .insert(agreedCancelRequests)
        .values([
          {
            ...base,
            reason: 'style_mismatch',
            status: 'declined',
            requestedAt: at('08:00'),
            expiresAt: nextDay('08:00'),
            respondedAt: at('08:30'),
          },
          {
            ...base,
            reason: 'other',
            reasonText: '손님 일정이 바뀌었대요',
            status: 'expired',
            requestedAt: at('09:00'),
            expiresAt: nextDay('09:00'),
            respondedAt: nextDay('09:10'),
          },
          {
            ...base,
            reason: 'customer_declined',
            status: 'requested',
            requestedAt: at('10:00'),
            expiresAt: nextDay('10:00'),
          },
        ])
        .returning({ id: agreedCancelRequests.id });
      // 다른 예약의 요청은 읽지 않는다
      await tx.insert(agreedCancelRequests).values({
        reservationId: other.reservation.id,
        requestedBy: shop.createdBy,
        reason: 'style_mismatch',
        status: 'requested',
        requestedAt: at('11:00'),
        expiresAt: nextDay('11:00'),
      });

      expect(await selectReservationAgreedCancels(tx, mine.reservation.id)).toEqual([
        {
          requestId: pending.id,
          reason: 'customer_declined',
          reasonText: null,
          status: 'requested',
          requestedAt: at('10:00'),
          expiresAt: nextDay('10:00'),
          respondedAt: null,
        },
        {
          requestId: expired.id,
          reason: 'other',
          reasonText: '손님 일정이 바뀌었대요',
          status: 'expired',
          requestedAt: at('09:00'),
          expiresAt: nextDay('09:00'),
          respondedAt: nextDay('09:10'),
        },
        {
          requestId: declined.id,
          reason: 'style_mismatch',
          reasonText: null,
          status: 'declined',
          requestedAt: at('08:00'),
          expiresAt: nextDay('08:00'),
          respondedAt: at('08:30'),
        },
      ]);
      expect(await selectReservationAgreedCancels(tx, crypto.randomUUID())).toEqual([]);
    });
  });
});
