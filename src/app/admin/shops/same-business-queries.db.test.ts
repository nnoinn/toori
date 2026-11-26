// 입점 심사의 '같은 사업자등록번호의 다른 샵'(#154 재가입과 악용 막기)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 번호를 숫자만 비교하는지(하이픈), 지금 샵·다른 번호는 빼는지, 원장님 사정 취소만 세는지, 못 걷은 패널티, 원장님 탈퇴 표시를 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { ownerPenalties, owners, shops } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { selectSameBusinessShops } from './same-business-queries';

const kst = (text: string) => new Date(`${text}+09:00`);

/** 테스트마다 다른 사업자등록번호(숫자 10자리). 테스트 DB의 다른 샵과 겹치지 않게 */
function businessNumber(): string {
  return String(Math.floor(Math.random() * 9e9) + 1e9);
}

async function ownerIdOf(tx: TestTx, shopId: string) {
  const [row] = await tx.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, shopId));
  return row.ownerId;
}

describeDb('같은 사업자등록번호의 다른 샵 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('번호를 숫자만 비교해 다른 샵을 신청이 늦은 것부터 주고, 지금 샵과 다른 번호는 뺀다', async () => {
    await withRollback(async (tx) => {
      const digits = businessNumber();
      const hyphened = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
      const current = await createTestShop(tx, {
        status: 'pending',
        businessRegistrationNumber: digits,
        appliedAt: kst('2026-11-20T10:00:00'),
      });
      const old = await createTestShop(tx, {
        status: 'withdrawn',
        name: '예전 샵',
        businessRegistrationNumber: hyphened,
        appliedAt: kst('2026-09-01T10:00:00'),
      });
      const rejected = await createTestShop(tx, {
        status: 'rejected',
        name: '반려된 샵',
        businessRegistrationNumber: digits,
        appliedAt: kst('2026-10-01T10:00:00'),
      });
      await createTestShop(tx, {
        status: 'approved',
        businessRegistrationNumber: businessNumber(),
      });
      const withdrawnAt = kst('2026-10-15T10:00:00');
      await tx
        .update(owners)
        .set({ withdrawnAt })
        .where(eq(owners.id, await ownerIdOf(tx, old.shopId)));

      const rows = await selectSameBusinessShops(tx, {
        shopId: current.shopId,
        businessRegistrationNumber: digits,
      });
      expect(rows).toEqual([
        {
          shopId: rejected.shopId,
          name: '반려된 샵',
          status: 'rejected',
          appliedAt: kst('2026-10-01T10:00:00'),
          ownerWithdrawnAt: null,
          ownerFaultCount: 0,
          unpaidPenalty: 0,
        },
        {
          shopId: old.shopId,
          name: '예전 샵',
          status: 'withdrawn',
          appliedAt: kst('2026-09-01T10:00:00'),
          ownerWithdrawnAt: withdrawnAt,
          ownerFaultCount: 0,
          unpaidPenalty: 0,
        },
      ]);
      // 하이픈을 넣어 받은 번호로 찾아도 같다
      expect(
        (
          await selectSameBusinessShops(tx, {
            shopId: current.shopId,
            businessRegistrationNumber: hyphened,
          })
        ).map((row) => row.shopId),
      ).toEqual([rejected.shopId, old.shopId]);
      expect(
        await selectSameBusinessShops(tx, {
          shopId: current.shopId,
          businessRegistrationNumber: '',
        }),
      ).toEqual([]);
    });
  });

  it('원장님 사정 취소만 세고(고객 취소는 빼고), 못 걷은 패널티는 다 걷지 않은 것의 남은 금액만 더한다', async () => {
    await withRollback(async (tx) => {
      const digits = businessNumber();
      const current = await createTestShop(tx, {
        status: 'pending',
        businessRegistrationNumber: digits,
      });
      const old = await createTestShop(tx, {
        status: 'withdrawn',
        businessRegistrationNumber: digits,
      });
      const { customerId } = await createTestCustomer(tx);
      const ownerFault = (start: string, end: string) =>
        createTestReservation(tx, old, customerId, start, end, 'cancelled', {
          cancelActor: 'owner_fault',
          cancelledAt: kst('2026-10-31T08:00:00'),
          hoursBeforeStartAtCancel: 2,
        });
      const first = await ownerFault('10:00', '11:00');
      const second = await ownerFault('11:00', '12:00');
      await createTestReservation(tx, old, customerId, '12:00', '13:00', 'cancelled', {
        cancelActor: 'customer',
        cancelledAt: kst('2026-10-31T08:00:00'),
      });
      await tx.insert(ownerPenalties).values([
        // 5,000원 중 2,000원만 걷음 → 3,000원 남음
        {
          shopId: old.shopId,
          reservationId: first.reservation.id,
          amount: 5000,
          collectedAmount: 2000,
        },
        // 다 걷음 → 더하지 않는다
        {
          shopId: old.shopId,
          reservationId: second.reservation.id,
          amount: 5000,
          collectedAmount: 5000,
          fullyCollectedAt: kst('2026-11-05T10:00:00'),
        },
      ]);

      const [row] = await selectSameBusinessShops(tx, {
        shopId: current.shopId,
        businessRegistrationNumber: digits,
      });
      expect(row).toMatchObject({ shopId: old.shopId, ownerFaultCount: 2, unpaidPenalty: 3000 });
      // 예전 샵에서 보면 지금 신청한 샵이 같은 사업자로 보인다
      expect(
        (
          await selectSameBusinessShops(tx, {
            shopId: old.shopId,
            businessRegistrationNumber: digits,
          })
        ).map((other) => other.shopId),
      ).toEqual([current.shopId]);
    });
  });
});
