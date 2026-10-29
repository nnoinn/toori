// 10분 홀딩 저장(acquireHold, releaseMyHold)을 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다. 차례로 누르는 경우다.
// 두 사람이 동시에 누르는 경우는 hold-concurrency.db.test.ts가 본다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { slots } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  type TestShop,
  testSlot,
} from '../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../tests/db/test-db';
import { acquireHold, releaseMyHold } from './hold-store';

/** testSlot은 2026-11-01(한국 시간) 매물이고 10/30에 게시된다. 이 시각에는 10시 이후 매물이 게시중이다 */
const NOW = new Date('2026-11-01T09:00:00+09:00');
const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

async function insertSlot(tx: TestTx, shop: TestShop, start: string, end: string, extra = {}) {
  const [row] = await tx
    .insert(slots)
    .values(testSlot(shop, start, end, extra))
    .returning();
  return row.id;
}

async function holdOf(tx: TestTx, slotId: string) {
  const [row] = await tx
    .select({ customerId: slots.holdCustomerId, expiresAt: slots.holdExpiresAt })
    .from(slots)
    .where(eq(slots.id, slotId));
  return row;
}

describeDb('10분 홀딩 저장 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('게시중 매물에 홀딩한 고객과 10분 뒤 만료 시각을 기록한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const slotId = await insertSlot(tx, shop, '10:00', '11:00');
      expect(await acquireHold(tx, { slotId, customerId, now: NOW })).toEqual({
        ok: true,
        holdExpiresAt: at(10),
      });
      expect(await holdOf(tx, slotId)).toEqual({ customerId, expiresAt: at(10) });
    });
  });

  it('게시 시각이 지난 예약대기 매물도 게시중이라 홀딩된다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const slotId = await insertSlot(tx, shop, '10:00', '11:00', { status: 'scheduled' });
      expect((await acquireHold(tx, { slotId, customerId, now: NOW })).ok).toBe(true);
    });
  });

  it.each<[string, string, string, Record<string, unknown>]>([
    ['게시 전 예약대기', '10:00', '11:00', { status: 'scheduled', publishAt: at(60) }],
    ['예약됨', '10:00', '11:00', { status: 'reserved' }],
    [
      '원장님 마감',
      '10:00',
      '11:00',
      { status: 'closed', closedAt: at(-60), closeReason: 'other' },
    ],
    ['취소', '10:00', '11:00', { status: 'cancelled' }],
    ['시작 시각이 지남', '08:00', '09:00', {}],
  ])('%s → SLOT_NOT_AVAILABLE이고 홀딩 칸은 그대로', async (_, start, end, extra) => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const slotId = await insertSlot(tx, shop, start, end, extra);
      expect(await acquireHold(tx, { slotId, customerId, now: NOW })).toEqual({
        ok: false,
        code: 'SLOT_NOT_AVAILABLE',
      });
      expect(await holdOf(tx, slotId)).toEqual({ customerId: null, expiresAt: null });
    });
  });

  it('승인되지 않은 샵의 매물과 없는 매물은 SLOT_NOT_AVAILABLE', async () => {
    await withRollback(async (tx) => {
      const { customerId } = await createTestCustomer(tx);
      for (const status of ['pending', 'rejected'] as const) {
        const shop = await createTestShop(tx, { status });
        const slotId = await insertSlot(tx, shop, '10:00', '11:00');
        const result = await acquireHold(tx, { slotId, customerId, now: NOW });
        expect(result).toEqual({ ok: false, code: 'SLOT_NOT_AVAILABLE' });
      }
      const missing = await acquireHold(tx, { slotId: crypto.randomUUID(), customerId, now: NOW });
      expect(missing).toEqual({ ok: false, code: 'SLOT_NOT_AVAILABLE' });
    });
  });

  it('다른 고객의 홀딩이 살아 있으면 HELD_BY_OTHER, 끝났으면 내가 홀딩한다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const slotId = await insertSlot(tx, shop, '10:00', '11:00', {
        holdCustomerId: other.customerId,
        holdExpiresAt: at(5),
      });
      expect(await acquireHold(tx, { slotId, customerId: me.customerId, now: NOW })).toEqual({
        ok: false,
        code: 'HELD_BY_OTHER',
      });
      expect((await holdOf(tx, slotId)).customerId).toBe(other.customerId);

      const later = at(5);
      expect((await acquireHold(tx, { slotId, customerId: me.customerId, now: later })).ok).toBe(
        true,
      );
      expect((await holdOf(tx, slotId)).customerId).toBe(me.customerId);
    });
  });

  it('신규 고객 전용 매물은 그 샵 이력이 있으면 NEW_CUSTOMER_ONLY, 없으면 홀딩된다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const visited = await createTestCustomer(tx);
      const fresh = await createTestCustomer(tx);
      await createTestReservation(tx, shop, visited.customerId, '07:00', '08:00', 'completed');
      const slotId = await insertSlot(tx, shop, '10:00', '11:00', { newCustomerOnly: true });

      expect(await acquireHold(tx, { slotId, customerId: visited.customerId, now: NOW })).toEqual({
        ok: false,
        code: 'NEW_CUSTOMER_ONLY',
      });
      expect((await acquireHold(tx, { slotId, customerId: fresh.customerId, now: NOW })).ok).toBe(
        true,
      );
    });
  });

  it('같은 매물을 다시 누르면 남은 시간 그대로, 다른 매물은 ALREADY_HOLDING, 끝나면 다른 매물도 된다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const { customerId } = await createTestCustomer(tx);
      const first = await insertSlot(tx, shop, '10:00', '11:00');
      const second = await insertSlot(tx, shop, '12:00', '13:00');

      await acquireHold(tx, { slotId: first, customerId, now: NOW });
      expect(await acquireHold(tx, { slotId: first, customerId, now: at(3) })).toEqual({
        ok: true,
        holdExpiresAt: at(10),
      });
      expect(await acquireHold(tx, { slotId: second, customerId, now: at(3) })).toEqual({
        ok: false,
        code: 'ALREADY_HOLDING',
        heldSlotId: first,
      });
      expect((await acquireHold(tx, { slotId: second, customerId, now: at(10) })).ok).toBe(true);
    });
  });

  it('풀기는 내 홀딩만 비운다', async () => {
    await withRollback(async (tx) => {
      const shop = await createTestShop(tx, { status: 'approved' });
      const me = await createTestCustomer(tx);
      const other = await createTestCustomer(tx);
      const slotId = await insertSlot(tx, shop, '10:00', '11:00');
      await acquireHold(tx, { slotId, customerId: me.customerId, now: NOW });

      expect(await releaseMyHold(tx, { slotId, customerId: other.customerId })).toBe(false);
      expect((await holdOf(tx, slotId)).customerId).toBe(me.customerId);
      expect(await releaseMyHold(tx, { slotId, customerId: me.customerId })).toBe(true);
      expect(await holdOf(tx, slotId)).toEqual({ customerId: null, expiresAt: null });
      expect(await releaseMyHold(tx, { slotId, customerId: me.customerId })).toBe(false);
    });
  });
});
