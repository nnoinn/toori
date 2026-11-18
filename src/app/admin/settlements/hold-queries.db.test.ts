// 운영자 정산 보류 화면 읽기(#373 ②)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 거래 보류는 그 예약의 샵, 샵 보류는 그 샵으로 읽고, 건·푼 운영자 이름과 순서(풀리지 않은 것 먼저)를 본다.

import { afterAll, expect, it } from 'vitest';

import { adminProfiles, settlementHolds } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import {
  isShopHeld,
  selectActiveHolds,
  selectReservationHolds,
  selectShopHolds,
  selectShopReservationHolds,
} from './hold-queries';

const at = (hm: string) => new Date(`2026-11-16T${hm}:00+09:00`);

describeDb('운영자 정산 보류 화면 읽기 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('거래·샵 보류를 샵 이름·예약번호·운영자 이름과 같이 읽고, 풀리지 않은 것 먼저·늦게 건 것부터 준다', async () => {
    await withRollback(async (tx) => {
      const adminA = await createTestUser(tx);
      const adminB = await createTestUser(tx);
      await tx.insert(adminProfiles).values([
        { userId: adminA, name: '가 운영자' },
        { userId: adminB, name: '나 운영자' },
      ]);
      const shop = await createTestShop(tx, { status: 'approved', name: '보류 샵' });
      const quiet = await createTestShop(tx, { status: 'approved', name: '조용한 샵' });
      const { customerId } = await createTestCustomer(tx);
      const made = await createTestReservation(tx, shop, customerId, '09:00', '10:00', 'confirmed');

      const [old, current, shopHold] = await tx
        .insert(settlementHolds)
        .values([
          {
            reservationId: made.reservation.id,
            reason: '지난 확인',
            reasonCode: 'other',
            heldBy: adminA,
            heldAt: at('09:00'),
            releasedBy: adminB,
            releasedAt: at('09:30'),
            releaseMemo: '확인함',
          },
          {
            reservationId: made.reservation.id,
            reason: '계좌 확인 필요',
            reasonCode: 'payout_info_check',
            heldBy: adminB,
            heldAt: at('10:00'),
          },
          {
            shopId: shop.shopId,
            reason: '사업자 정보 확인',
            reasonCode: 'user_inquiry',
            heldBy: adminA,
            heldAt: at('11:00'),
          },
        ])
        .returning({ id: settlementHolds.id });

      expect(await selectReservationHolds(tx, made.reservation.id)).toEqual([
        {
          holdId: current.id,
          reservationId: made.reservation.id,
          reservationCode: made.reservation.code,
          shopId: shop.shopId,
          shopName: '보류 샵',
          reason: '계좌 확인 필요',
          reasonCode: 'payout_info_check',
          heldAt: at('10:00'),
          heldByName: '나 운영자',
          releasedAt: null,
          releasedByName: null,
          releaseMemo: null,
        },
        expect.objectContaining({
          holdId: old.id,
          releasedAt: at('09:30'),
          releasedByName: '나 운영자',
          releaseMemo: '확인함',
        }),
      ]);
      expect(await selectShopHolds(tx, shop.shopId)).toMatchObject([
        {
          holdId: shopHold.id,
          reservationId: null,
          reservationCode: null,
          shopName: '보류 샵',
          reasonCode: 'user_inquiry',
        },
      ]);
      expect((await selectShopReservationHolds(tx, shop.shopId)).map((row) => row.holdId)).toEqual([
        current.id,
      ]);
      const active = (await selectActiveHolds(tx, 200)).filter((row) => row.shopId === shop.shopId);
      expect(active.map((row) => row.holdId)).toEqual([shopHold.id, current.id]);
      expect(await isShopHeld(tx, shop.shopId)).toBe(true);
      expect(await isShopHeld(tx, quiet.shopId)).toBe(false);
      expect(await selectShopReservationHolds(tx, quiet.shopId)).toEqual([]);
    });
  });
});
