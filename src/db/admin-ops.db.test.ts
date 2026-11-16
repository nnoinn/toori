// 운영자 문제 대처 DB 구조 (마이그레이션 0018, #433, #373 ②④⑥). 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// - cron_runs: 정해진 작업만, 끝난 시각과 성공 여부는 같이 채운다
// - settlement_holds: 거래와 샵 중 하나만, 푼 운영자·시각·메모는 같이, 풀리지 않은 보류는 대상마다 하나
// - shops: 게시 멈춘 시각과 사유는 같이
// - slots·slot_windows: 마감 사유에 운영자 마감(admin)

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { cronRuns, settlementHolds, shops, slots, slotWindows } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
  testSlot,
} from '../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../tests/db/test-db';

/** savepoint 안에서 돌려 막혔으면 제약 이름이 든 오류 문구, 통과했으면 null. 바깥 트랜잭션은 계속 쓸 수 있다 */
async function blockedMessage(tx: TestTx, run: (t: TestTx) => Promise<unknown>) {
  try {
    await tx.transaction(async (t) => {
      await run(t);
    });
    return null;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    const { message, constraint_name: constraint } = cause as {
      message?: string;
      constraint_name?: string;
    };
    return `${constraint ?? ''} ${message ?? String(cause)}`;
  }
}

const AT = new Date('2026-11-16T10:00:00+09:00');

describeDb('운영자 문제 대처 DB 구조 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('예약 작업 기록: 정해진 작업 4개만, 끝난 시각과 성공 여부는 같이 채운다', async () => {
    await withRollback(async (tx) => {
      // 도는 중(둘 다 비움)과 끝남(둘 다 채움)은 된다
      await tx.insert(cronRuns).values([
        { job: 'payments-sweep', startedAt: AT },
        {
          job: 'settlement-batch',
          startedAt: AT,
          finishedAt: AT,
          ok: false,
          error: 'TypeError: fetch failed',
        },
        { job: 'reminders', startedAt: AT, finishedAt: AT, ok: true, summary: { sent: 2 } },
        { job: 'slot-digest', startedAt: AT, finishedAt: AT, ok: true },
      ]);

      expect(
        await blockedMessage(tx, (t) =>
          t.insert(cronRuns).values({ job: 'unknown', startedAt: AT }),
        ),
      ).toContain('cron_runs_job_check');
      expect(
        await blockedMessage(tx, (t) =>
          t.insert(cronRuns).values({ job: 'reminders', startedAt: AT, finishedAt: AT }),
        ),
      ).toContain('cron_runs_finished_check');
      expect(
        await blockedMessage(tx, (t) =>
          t.insert(cronRuns).values({ job: 'reminders', startedAt: AT, ok: true }),
        ),
      ).toContain('cron_runs_finished_check');
    });
  });

  it('정산 보류: 거래와 샵 중 하나만 채우고, 푼 운영자·시각·메모는 같이 채운다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      const base = { reason: '원장님 계좌 확인 필요', heldBy: adminId, heldAt: AT };

      await tx.insert(settlementHolds).values([
        { ...base, reservationId: reservation.id },
        { ...base, shopId: shop.shopId },
      ]);
      expect(await blockedMessage(tx, (t) => t.insert(settlementHolds).values(base))).toContain(
        'settlement_holds_target_check',
      );
      expect(
        await blockedMessage(tx, (t) =>
          t
            .insert(settlementHolds)
            .values({ ...base, reservationId: reservation.id, shopId: shop.shopId }),
        ),
      ).toContain('settlement_holds_target_check');

      // 푼 운영자만, 메모 없이는 풀 수 없다
      const [hold] = await tx
        .select({ id: settlementHolds.id })
        .from(settlementHolds)
        .where(eq(settlementHolds.reservationId, reservation.id));
      expect(
        await blockedMessage(tx, (t) =>
          t
            .update(settlementHolds)
            .set({ releasedBy: adminId, releasedAt: AT })
            .where(eq(settlementHolds.id, hold.id)),
        ),
      ).toContain('settlement_holds_release_check');
      await tx
        .update(settlementHolds)
        .set({ releasedBy: adminId, releasedAt: AT, releaseMemo: '계좌 확인함' })
        .where(eq(settlementHolds.id, hold.id));
    });
  });

  it('정산 보류: 풀리지 않은 보류는 거래마다·샵마다 하나이고, 푼 뒤에는 다시 걸 수 있다(지난 보류는 남는다)', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'confirmed',
      );
      const base = { reason: '확인 필요', heldBy: adminId, heldAt: AT };
      await tx.insert(settlementHolds).values([
        { ...base, reservationId: reservation.id },
        { ...base, shopId: shop.shopId },
      ]);

      expect(
        await blockedMessage(tx, (t) =>
          t.insert(settlementHolds).values({ ...base, reservationId: reservation.id }),
        ),
      ).toContain('settlement_holds_reservation_active_unique');
      expect(
        await blockedMessage(tx, (t) =>
          t.insert(settlementHolds).values({ ...base, shopId: shop.shopId }),
        ),
      ).toContain('settlement_holds_shop_active_unique');

      await tx
        .update(settlementHolds)
        .set({ releasedBy: adminId, releasedAt: AT, releaseMemo: '풀어 줌' })
        .where(eq(settlementHolds.reservationId, reservation.id));
      await tx.insert(settlementHolds).values({ ...base, reservationId: reservation.id });
      const rows = await tx
        .select({ releasedAt: settlementHolds.releasedAt })
        .from(settlementHolds)
        .where(eq(settlementHolds.reservationId, reservation.id));
      expect(rows.map((row) => row.releasedAt === null).sort()).toEqual([false, true]);
    });
  });

  it('샵 게시 멈춤: 멈춘 시각과 사유는 같이 채우고 같이 비운다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const pause = (values: Partial<typeof shops.$inferInsert>) =>
        blockedMessage(tx, (t) => t.update(shops).set(values).where(eq(shops.id, shop.shopId)));

      expect(await pause({ publishPausedAt: AT })).toContain('shops_publish_pause_check');
      expect(await pause({ publishPausedReason: '신고 확인 중' })).toContain(
        'shops_publish_pause_check',
      );
      expect(await pause({ publishPausedAt: AT, publishPausedReason: '신고 확인 중' })).toBeNull();
      expect(await pause({ publishPausedAt: null, publishPausedReason: null })).toBeNull();
    });
  });

  it('매물·시간대 매물 마감 사유에 운영자 마감(admin)이 있고, 모르는 사유는 막힌다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const [slot] = await tx
        .insert(slots)
        .values(
          testSlot(shop, '09:00', '10:00', {
            status: 'closed',
            closeReason: 'admin',
            closedAt: AT,
          }),
        )
        .returning({ id: slots.id });
      expect(slot.id).toBeTruthy();
      expect(
        await blockedMessage(tx, (t) =>
          t.update(slots).set({ closeReason: 'deleted' }).where(eq(slots.id, slot.id)),
        ),
      ).toContain('slots_close_reason_check');

      const [window] = await tx
        .insert(slotWindows)
        .values({
          shopId: shop.shopId,
          startAt: new Date('2026-11-01T13:00:00+09:00'),
          endAt: new Date('2026-11-01T15:00:00+09:00'),
          publishAt: new Date('2026-10-30T13:00:00+09:00'),
          status: 'closed',
          closeReason: 'admin',
          closedAt: AT,
          createdBy: shop.createdBy,
        })
        .returning({ id: slotWindows.id });
      expect(
        await blockedMessage(tx, (t) =>
          t
            .update(slotWindows)
            .set({ closeReason: 'deleted' })
            .where(eq(slotWindows.id, window.id)),
        ),
      ).toContain('slot_windows_close_reason_check');
    });
  });
});
