// 운영자 이의제기 화면 조회(목록·상세)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다 (A-104, W19 ②).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { disputes, shops } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  type TestShop,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { selectDisputeDetail, selectDisputes } from './queries';

const unique = (prefix: string) => `${prefix}${crypto.randomUUID().slice(0, 8)}`;
const at = (day: number, hm: string) => new Date(`2026-11-0${day}T${hm}:00+09:00`);

/** 샵에 이용 완료 예약 하나와 그 이의제기 */
async function addDispute(
  tx: TestTx,
  shop: TestShop,
  start: string,
  end: string,
  values: Partial<typeof disputes.$inferInsert> & { receivedAt: Date },
) {
  const { customerId } = await createTestCustomer(tx);
  const { reservation } = await createTestReservation(
    tx,
    shop,
    customerId,
    start,
    end,
    'completed',
    { visitResult: 'no_show', visitRecordedAt: at(1, '12:00') },
  );
  const [row] = await tx
    .insert(disputes)
    .values({
      reservationId: reservation.id,
      type: 'no_show',
      content: '방문했는데 노쇼로 처리됐어요',
      status: 'open',
      channel: 'app',
      ...values,
    })
    .returning({ id: disputes.id });
  return { disputeId: row.id, reservation };
}

describeDb('운영자 이의제기 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('확인 중은 받은 시각이 오래된 순, 결론은 기록한 시각이 최근인 순, 전체는 받은 시각이 최근인 순. 예약번호·샵 이름으로 찾는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const shopName = unique('이의샵');
      await tx.update(shops).set({ name: shopName }).where(eq(shops.id, shop.shopId));
      const adminId = await createTestUser(tx);
      const older = await addDispute(tx, shop, '09:00', '10:00', { receivedAt: at(2, '09:00') });
      const newer = await addDispute(tx, shop, '10:00', '11:00', {
        receivedAt: at(2, '15:00'),
        channel: 'kakao',
        registeredBy: adminId,
      });
      const doneEarly = await addDispute(tx, shop, '11:00', '12:00', {
        receivedAt: at(2, '10:00'),
        status: 'resolved',
        outcome: 'no_change',
        handledBy: adminId,
        handledAt: at(3, '09:00'),
      });
      const doneLate = await addDispute(tx, shop, '12:00', '13:00', {
        receivedAt: at(2, '11:00'),
        status: 'resolved',
        outcome: 'no_show_confirmed',
        handledBy: adminId,
        handledAt: at(3, '18:00'),
      });
      const ids = async (filter: 'open' | 'resolved' | 'all', query = shopName) =>
        (await selectDisputes(tx, { filter, query })).rows.map((row) => row.disputeId);

      expect(await ids('open')).toEqual([older.disputeId, newer.disputeId]);
      expect(await ids('resolved')).toEqual([doneLate.disputeId, doneEarly.disputeId]);
      expect(await ids('all')).toEqual([
        newer.disputeId,
        doneLate.disputeId,
        doneEarly.disputeId,
        older.disputeId,
      ]);
      expect(await ids('all', newer.reservation.code)).toEqual([newer.disputeId]);
      expect(await ids('all', unique('없는샵'))).toEqual([]);

      const [row] = (await selectDisputes(tx, { filter: 'open', query: shopName })).rows;
      expect(row).toEqual({
        disputeId: older.disputeId,
        receivedAt: at(2, '09:00'),
        channel: 'app',
        type: 'no_show',
        status: 'open',
        outcome: null,
        handledAt: null,
        reservationId: older.reservation.id,
        reservationCode: older.reservation.code,
        shopName,
      });
    });
  });

  it('상세는 이의제기 내용·결론과 그 예약(상태·방문 결과·처리·시작 시각·메뉴)·샵·고객 닉네임을 읽고, 없는 이의제기는 null', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved', name: '상세 이의샵' });
      const adminId = await createTestUser(tx);
      const { disputeId, reservation } = await addDispute(tx, shop, '09:00', '10:00', {
        receivedAt: at(2, '09:00'),
        status: 'resolved',
        outcome: 'no_show_reversed',
        result: '원장님이 방문을 확인함',
        handledBy: adminId,
        handledAt: at(3, '10:00'),
      });

      expect(await selectDisputeDetail(tx, disputeId)).toMatchObject({
        disputeId,
        receivedAt: at(2, '09:00'),
        channel: 'app',
        type: 'no_show',
        status: 'resolved',
        outcome: 'no_show_reversed',
        handledAt: at(3, '10:00'),
        content: '방문했는데 노쇼로 처리됐어요',
        result: '원장님이 방문을 확인함',
        reservationId: reservation.id,
        reservationCode: reservation.code,
        reservationStatus: 'completed',
        visitResult: 'no_show',
        visitRecordedAt: at(1, '12:00'),
        cancelledAt: null,
        startAt: at(1, '09:00'),
        menuName: '커트',
        shopId: shop.shopId,
        shopName: '상세 이의샵',
        customerNickname: '테스트 고객',
      });
      expect(await selectDisputeDetail(tx, crypto.randomUUID())).toBeNull();
    });
  });
});
