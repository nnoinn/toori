// 원장님 예약 상세 조회가 그 샵 예약만 예약자 정보와 같이 읽는지 실제 DB로 본다(O11, S-403, X-102).
// 이의제기(S-407)는 접수 시각·상태·결론만 읽고 손님이 쓴 내용과 운영자 메모는 읽지 않는지도 본다.
// TEST_DATABASE_URL이 있을 때만 돈다(PR 자동 검사). docs/tech-guide.md 3-4 "DB 테스트"

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { customers, disputes } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../../tests/db/test-db';
import { selectOwnerReservation } from './reservation-detail-store';

afterAll(closeTestDb);

describeDb('원장님 예약 상세 조회 (실제 DB)', () => {
  it('그 샵 예약을 매물·예약자 정보(이름·휴대폰, 닉네임은 빼고)와 같이 읽는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      // 이름과 닉네임을 다르게 넣어, 샵에 닉네임이 아니라 이름을 주는지 본다(#375)
      await tx
        .update(customers)
        .set({ name: '김투리', nickname: '투리팬', phone: '010-1234-5678' })
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
        customerName: '김투리',
        customerPhone: '010-1234-5678',
        dispute: null,
      });
      // toEqual이 칸을 모두 맞춰 보지만, 닉네임 값이 어느 칸에도 없다는 것을 한 번 더 적어 둔다
      expect(Object.values(found ?? {})).not.toContain('투리팬');
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

  it('이의제기는 확인 중이면 접수 시각, 결론이 났으면 결론과 기록 시각까지만 읽는다(S-407)', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx);
      const customer = await createTestCustomer(tx);
      const { reservation: open } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '10:00',
        '11:00',
        'completed',
        { visitResult: 'no_show', visitRecordedAt: new Date('2026-11-15T11:10:00+09:00') },
      );
      const { reservation: resolved } = await createTestReservation(
        tx,
        shop,
        customer.customerId,
        '14:00',
        '15:00',
        'completed',
        { visitResult: 'visited', visitRecordedAt: new Date('2026-11-15T15:10:00+09:00') },
      );
      const openAt = new Date('2026-11-15T12:00:00+09:00');
      const resolvedAt = new Date('2026-11-15T16:00:00+09:00');
      const handledAt = new Date('2026-11-17T10:00:00+09:00');
      await tx.insert(disputes).values([
        {
          reservationId: open.id,
          type: 'no_show',
          content: '방문했는데 노쇼로 처리됐어요',
          status: 'open',
          channel: 'app',
          receivedAt: openAt,
        },
        {
          reservationId: resolved.id,
          type: 'after_start',
          content: '시술 중에 문제가 있었어요',
          status: 'resolved',
          channel: 'app',
          receivedAt: resolvedAt,
          outcome: 'no_change',
          result: '원장님과 통화해 확인함',
          handledAt,
        },
      ]);

      const openFound = await selectOwnerReservation(tx, shop.shopId, open.id);
      expect(openFound?.dispute).toEqual({ status: 'open', receivedAt: openAt });
      const resolvedFound = await selectOwnerReservation(tx, shop.shopId, resolved.id);
      expect(resolvedFound?.dispute).toEqual({
        status: 'resolved',
        receivedAt: resolvedAt,
        outcome: 'no_change',
        handledAt,
      });
      // 손님이 고른 종류·쓴 내용과 운영자 결론 메모는 어느 칸에도 없다
      const read = JSON.stringify([openFound, resolvedFound]);
      for (const hidden of [
        '방문했는데 노쇼로 처리됐어요',
        '시술 중에 문제가 있었어요',
        '원장님과 통화해 확인함',
        'after_start',
      ]) {
        expect(read).not.toContain(hidden);
      }
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
