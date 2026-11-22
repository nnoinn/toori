// 운영자 처리 기록은 바꾼 데이터와 한 트랜잭션 (AUTH-10, #372·#373 공통 규칙). 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 처리 기록을 남기지 못하면(없는 운영자 id라 admin_actions의 운영자 FK에 걸림) 앞에서 바꾼 것도 남지 않고,
// 성공이라고 돌려주지 않는지 본다. 기록 실패를 삼키면 화면에는 성공으로 보이는데 기록 없이 바뀌거나 아무것도 바뀌지 않는다.
// 정산 보류·예약 무효는 바꾸는 줄에도 운영자 id(held_by·released_by, processed_by)를 써서 처리 기록만 실패하게 만들 수 없어 여기서 보지 않는다.
// 처리마다 기록이 같은 트랜잭션으로 남는 것은 각 저장 함수의 DB 테스트가 본다(hold-store·admin-store·admin-visit-store·void-store).

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { reservations, slots, slotWindows } from '@/db/schema';
import { readPublishPause } from '@/server/shops/publish-pause';
import {
  forceCloseSlotInTx,
  forceCloseWindowInTx,
  pausePublishingInTx,
  resumePublishingInTx,
} from '@/server/slots/admin-store';
import { reverseNoShowInTx } from '@/server/visits/admin-visit-store';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  testSlot,
} from '../../../tests/db/fixtures';
import {
  closeTestDb,
  describeDb,
  violatedConstraint,
  withRollback,
} from '../../../tests/db/test-db';

/** 11/01 매물(10/30 10시 게시)이 게시중인 때 */
const NOW = new Date('2026-10-31T12:00:00+09:00');
/** 처리 기록(admin_actions)의 운영자 FK */
const ADMIN_FK = 'admin_actions_admin_id_profiles_id_fk';

/** profiles에 없는 운영자 id. 처리 기록만 이 id를 쓴다 */
const missingAdmin = () => crypto.randomUUID();

describeDb('운영자 처리 기록과 바꾼 데이터는 한 트랜잭션 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('게시 멈춤·다시 열기: 처리 기록을 남기지 못하면 멈춤도, 다시 열기도 남지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const args = { shopId: shop.shopId, reason: '확인', now: NOW };

      expect(
        await violatedConstraint(tx, (t) =>
          pausePublishingInTx(t, { ...args, adminId: missingAdmin(), code: 'other' }),
        ),
      ).toBe(ADMIN_FK);
      expect(await readPublishPause(shop.shopId, tx)).toBeNull();

      // 진짜 운영자로 멈춘 뒤, 다시 열기의 기록이 실패하면 멈춘 그대로다
      const adminId = await createTestUser(tx);
      expect(await pausePublishingInTx(tx, { ...args, adminId, code: 'other' })).toMatchObject({
        ok: true,
      });
      expect(
        await violatedConstraint(tx, (t) =>
          resumePublishingInTx(t, { ...args, adminId: missingAdmin() }),
        ),
      ).toBe(ADMIN_FK);
      expect(await readPublishPause(shop.shopId, tx)).toEqual({ pausedAt: NOW, code: 'other' });
    });
  });

  it('매물·시간대 강제 마감: 처리 기록을 남기지 못하면 마감되지 않는다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const [slot] = await tx
        .insert(slots)
        .values(testSlot(shop, '09:00', '10:00'))
        .returning({ id: slots.id });
      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T13:00:00+09:00'),
          endAt: new Date('2026-11-01T17:00:00+09:00'),
          publishAt: new Date('2026-10-30T10:00:00+09:00'),
          status: 'published',
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });
      const input = { adminId: missingAdmin(), reason: '확인', code: 'other' as const, now: NOW };

      expect(
        await violatedConstraint(tx, (t) => forceCloseSlotInTx(t, { ...input, slotId: slot.id })),
      ).toBe(ADMIN_FK);
      const [slotAfter] = await tx
        .select({ status: slots.status, closeReason: slots.closeReason })
        .from(slots)
        .where(eq(slots.id, slot.id));
      expect(slotAfter).toEqual({ status: 'published', closeReason: null });

      expect(
        await violatedConstraint(tx, (t) =>
          forceCloseWindowInTx(t, { ...input, windowId: window.id }),
        ),
      ).toBe(ADMIN_FK);
      const [windowAfter] = await tx
        .select({ status: slotWindows.status })
        .from(slotWindows)
        .where(eq(slotWindows.id, window.id));
      expect(windowAfter).toEqual({ status: 'published' });
    });
  });

  it('노쇼 되돌리기: 처리 기록을 남기지 못하면 노쇼 그대로다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const made = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'completed',
        {
          visitResult: 'no_show',
          visitRecordedAt: new Date('2026-11-01T11:00:00+09:00'),
        },
      );

      expect(
        await violatedConstraint(tx, (t) =>
          reverseNoShowInTx(t, {
            reservationId: made.reservation.id,
            adminId: missingAdmin(),
            reason: '확인',
          }),
        ),
      ).toBe(ADMIN_FK);
      const [after] = await tx
        .select({ visitResult: reservations.visitResult })
        .from(reservations)
        .where(eq(reservations.id, made.reservation.id));
      expect(after).toEqual({ visitResult: 'no_show' });
    });
  });
});
