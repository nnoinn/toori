// 운영자 매물·예약 화면 [시간대 매물] 탭 조회와 시간대 매물 상세(#567)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.
// 샵 이름으로 찾기, 지금 시각으로 나눈 상태 거르기, 시간대마다 서비스 수·예약된 칸·결제 중 칸, 다 참(windowStatus)을 본다.
// 상세는 시간대 내용·서비스·손님이 만든 칸과 그 예약·이 시간대의 운영자 처리 기록을 본다.

import { afterAll, expect, it } from 'vitest';

import {
  adminActions,
  adminProfiles,
  menus,
  orders,
  reservations,
  slots,
  slotWindowMenus,
  slotWindows,
} from '@/db/schema';

import {
  createTestCustomer,
  createTestShop,
  createTestUser,
  type TestShop,
  testSlot,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, type TestTx, withRollback } from '../../../../tests/db/test-db';
import { selectAdminWindowDetail, selectAdminWindows } from './window-queries';

const kst = (dateTime: string) => new Date(`${dateTime}+09:00`);
/** 화면을 연 시각 */
const NOW = kst('2026-11-01T12:00:00');

/** 시간대 하나와 올린 서비스(메뉴 id마다 60분). 시각은 한국 시각 */
async function addWindow(
  tx: TestTx,
  shop: TestShop,
  input: {
    start: string;
    end: string;
    publishAt?: string;
    status?: 'scheduled' | 'published' | 'closed';
    menuIds?: string[];
  },
) {
  const [row] = await tx
    .insert(slotWindows)
    .values({
      shopId: shop.shopId,
      startAt: kst(input.start),
      endAt: kst(input.end),
      publishAt: kst(input.publishAt ?? '2026-10-31T08:00:00'),
      status: input.status ?? 'published',
      closeReason: input.status === 'closed' ? 'other' : null,
      closedAt: input.status === 'closed' ? kst('2026-10-31T09:00:00') : null,
      createdBy: shop.createdBy,
    })
    .returning({ id: slotWindows.id });
  await tx.insert(slotWindowMenus).values(
    (input.menuIds ?? [shop.menuId]).map((menuId) => ({
      windowId: row.id,
      menuId,
      serviceType: 'cut',
      menuName: '커트',
      listPrice: 20000,
      durationMinutes: 60,
      discountRate: 10,
      salePrice: 18000,
    })),
  );
  return row.id;
}

/** 시간대 안에서 손님이 결제를 마친 칸(예약). 예약 상태를 받는다 */
async function bookCell(
  tx: TestTx,
  shop: TestShop,
  input: { windowId: string; customerId: string; start: string; end: string },
  status: 'confirmed' | 'cancelled',
) {
  const [slot] = await tx
    .insert(slots)
    .values(
      testSlot(shop, input.start, input.end, {
        windowId: input.windowId,
        status: status === 'confirmed' ? 'reserved' : 'cancelled',
      }),
    )
    .returning({ id: slots.id, salePrice: slots.salePrice });
  const [order] = await tx
    .insert(orders)
    .values({
      paymentId: `test_${crypto.randomUUID()}`,
      slotId: slot.id,
      customerId: input.customerId,
      salePrice: slot.salePrice,
      amount: slot.salePrice,
      refundPolicyVersion: 'test',
      refundPolicyAgreedAt: kst('2026-10-31T10:00:00'),
      status: 'confirmed',
      paidAt: kst('2026-10-31T10:05:00'),
    })
    .returning({ id: orders.id });
  await tx.insert(reservations).values({
    code: `T${crypto.randomUUID().slice(0, 8)}`,
    slotId: slot.id,
    orderId: order.id,
    customerId: input.customerId,
    status,
    ...(status === 'cancelled'
      ? { cancelActor: 'customer', cancelledAt: kst('2026-10-31T11:00:00') }
      : {}),
  });
}

/**
 * 한 샵(이름으로 찾는다)의 시간대 넷과 다른 샵의 시간대 하나. 화면을 연 시각은 NOW(11/1 12:00)
 * - scheduled: 11/2 10~12시, 게시 전(게시예정), 서비스 둘. 기한이 지난 결제 중 칸이 하나 있다(세지 않는다)
 * - full: 11/1 13~15시 게시중. 13~14시 예약, 같은 시간 손님이 취소한 칸(세지 않는다), 14~15시 결제 중이라 다 참
 * - closed: 11/3 원장님이 마감 / ended: 11/1 9~11시 이미 끝남
 * - elsewhere: 다른 샵 11/1 16~18시 게시중(빈 시간대)
 */
async function seedWindows(tx: TestTx) {
  const name = `시간대 목록 ${crypto.randomUUID().slice(0, 8)}`;
  const shop = await createTestShop(tx, { status: 'approved', name });
  const other = await createTestShop(tx, { status: 'approved' });
  const customer = await createTestCustomer(tx);
  const [perm] = await tx
    .insert(menus)
    .values({
      shopId: shop.shopId,
      serviceType: 'perm',
      name: '펌',
      listPrice: 50000,
      durationMinutes: 120,
      sortOrder: 1,
    })
    .returning({ id: menus.id });

  const scheduled = await addWindow(tx, shop, {
    start: '2026-11-02T10:00:00',
    end: '2026-11-02T12:00:00',
    publishAt: '2026-11-01T18:00:00',
    status: 'scheduled',
    menuIds: [shop.menuId, perm.id],
  });
  await tx.insert(slots).values({
    ...testSlot(shop, '10:00', '11:00', {
      windowId: scheduled,
      holdCustomerId: customer.customerId,
      holdExpiresAt: kst('2026-11-01T11:50:00'),
    }),
    startAt: kst('2026-11-02T10:00:00'),
    endAt: kst('2026-11-02T11:00:00'),
  });

  const full = await addWindow(tx, shop, {
    start: '2026-11-01T13:00:00',
    end: '2026-11-01T15:00:00',
  });
  const cell = { windowId: full, customerId: customer.customerId, start: '13:00', end: '14:00' };
  await bookCell(tx, shop, cell, 'confirmed');
  await bookCell(tx, shop, cell, 'cancelled');
  await tx.insert(slots).values(
    testSlot(shop, '14:00', '15:00', {
      windowId: full,
      holdCustomerId: customer.customerId,
      holdExpiresAt: kst('2026-11-01T12:05:00'),
    }),
  );

  const closed = await addWindow(tx, shop, {
    start: '2026-11-03T10:00:00',
    end: '2026-11-03T12:00:00',
    status: 'closed',
  });
  const ended = await addWindow(tx, shop, {
    start: '2026-11-01T09:00:00',
    end: '2026-11-01T11:00:00',
  });
  const elsewhere = await addWindow(tx, other, {
    start: '2026-11-01T16:00:00',
    end: '2026-11-01T18:00:00',
  });
  return { name, shop, other, ids: { scheduled, full, closed, ended, elsewhere } };
}

type Filter = 'all' | 'scheduled' | 'published' | 'closed';

describeDb('운영자 시간대 매물 목록 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('시작이 늦은 순으로, 시간대마다 서비스 수와 지금 상태(다 참·마감 포함)를 준다', async () => {
    await withRollback(async (tx) => {
      const { name, shop, ids } = await seedWindows(tx);
      const list = await selectAdminWindows(tx, { filter: 'all', query: name, now: NOW });
      expect(list.hasMore).toBe(false);
      expect(list.rows.map((row) => [row.windowId, row.state, row.menuCount])).toEqual([
        [ids.closed, 'closed', 1],
        [ids.scheduled, 'scheduled', 2],
        [ids.full, 'full', 1],
        [ids.ended, 'closed', 1],
      ]);
      expect(list.rows[2]).toMatchObject({
        shopId: shop.shopId,
        shopName: name,
        startAt: kst('2026-11-01T13:00:00'),
        endAt: kst('2026-11-01T15:00:00'),
      });
    });
  });

  it('예약된 칸은 결제가 끝난 예약만(취소 제외), 결제 중 칸은 기한이 남은 홀딩만 센다', async () => {
    await withRollback(async (tx) => {
      const { name, ids } = await seedWindows(tx);
      const list = await selectAdminWindows(tx, { filter: 'all', query: name, now: NOW });
      const counts = Object.fromEntries(
        list.rows.map((row) => [row.windowId, [row.bookedCount, row.holdingCount]]),
      );
      expect(counts).toEqual({
        [ids.closed]: [0, 0],
        [ids.scheduled]: [0, 0],
        [ids.full]: [1, 1],
        [ids.ended]: [0, 0],
      });
    });
  });

  it('상태 거르기: 게시예정(게시 시각 전) / 게시중(다 찬 시간대 포함) / 마감(마감했거나 끝남)', async () => {
    await withRollback(async (tx) => {
      const { name, ids } = await seedWindows(tx);
      const ofFilter = async (filter: Filter) =>
        (await selectAdminWindows(tx, { filter, query: name, now: NOW })).rows.map(
          (row) => row.windowId,
        );
      expect(await ofFilter('scheduled')).toEqual([ids.scheduled]);
      expect(await ofFilter('published')).toEqual([ids.full]);
      expect(await ofFilter('closed')).toEqual([ids.closed, ids.ended]);
    });
  });

  it('샵 이름 일부로 찾고, 검색어가 없으면 다른 샵 것도 보인다', async () => {
    await withRollback(async (tx) => {
      const { name, other, ids } = await seedWindows(tx);
      const found = await selectAdminWindows(tx, {
        filter: 'published',
        query: name.slice(-8),
        now: NOW,
      });
      expect(found.rows.map((row) => row.windowId)).toEqual([ids.full]);
      const everyone = await selectAdminWindows(tx, { filter: 'published', query: '', now: NOW });
      expect(everyone.rows.find((row) => row.windowId === ids.elsewhere)).toMatchObject({
        shopId: other.shopId,
        state: 'published',
        bookedCount: 0,
        holdingCount: 0,
      });
      expect(everyone.rows.some((row) => row.windowId === ids.full)).toBe(true);
    });
  });

  it('맞는 시간대가 없으면 빈 목록', async () => {
    await withRollback(async (tx) => {
      expect(
        await selectAdminWindows(tx, {
          filter: 'all',
          query: `없는 샵 ${crypto.randomUUID()}`,
          now: NOW,
        }),
      ).toEqual({ rows: [], hasMore: false });
    });
  });

  it('상세: 시간대 내용·지금 상태·올린 서비스, 손님이 만든 칸(시작 순)과 칸마다 예약(취소 포함)을 준다', async () => {
    await withRollback(async (tx) => {
      const { name, shop, ids } = await seedWindows(tx);
      const detail = await selectAdminWindowDetail(tx, { windowId: ids.full, now: NOW });
      expect(detail).toMatchObject({
        windowId: ids.full,
        shopId: shop.shopId,
        shopName: name,
        startAt: kst('2026-11-01T13:00:00'),
        endAt: kst('2026-11-01T15:00:00'),
        publishAt: kst('2026-10-31T08:00:00'),
        newCustomerOnly: false,
        state: 'full',
        closedAt: null,
        closeReason: null,
        menus: [
          expect.objectContaining({
            menuId: shop.menuId,
            name: '커트',
            durationMinutes: 60,
            listPrice: 20000,
            discountRate: 10,
            salePrice: 18000,
          }),
        ],
      });
      const cells = detail!.cells;
      expect(cells.map((cell) => cell.startAt)).toEqual([
        kst('2026-11-01T13:00:00'),
        kst('2026-11-01T13:00:00'),
        kst('2026-11-01T14:00:00'),
      ]);
      // 13시 칸 둘: 결제를 마친 예약과 손님이 취소한 예약. 순서는 칸 id 순이라 상태로 맞춘다
      expect(
        cells
          .slice(0, 2)
          .map((cell) => [cell.status, cell.reservations.map((r) => r.status)])
          .sort(),
      ).toEqual([
        ['cancelled', ['cancelled']],
        ['reserved', ['confirmed']],
      ]);
      // 14시 칸: 결제 중(예약 없음)
      expect(cells[2]).toMatchObject({
        status: 'published',
        holdExpiresAt: kst('2026-11-01T12:05:00'),
        reservations: [],
      });
      expect(cells[2].holdCustomerId).not.toBeNull();
    });
  });

  it('상세: 마감한 시간대는 마감 시각·사유를, 운영자 처리 기록은 이 시간대 것만 최근 순으로 준다. 없는 시간대는 null', async () => {
    await withRollback(async (tx) => {
      const { ids } = await seedWindows(tx);
      const admin = await createTestUser(tx);
      await tx.insert(adminProfiles).values({ userId: admin, name: `운영자 ${admin.slice(0, 6)}` });
      const at = (hm: string) => kst(`2026-10-31T${hm}:00`);
      const action = (targetType: string, targetId: string, memo: string, createdAt: Date) => ({
        adminId: admin,
        action: 'slot.force_close',
        targetType,
        targetId,
        memo,
        createdAt,
      });
      await tx
        .insert(adminActions)
        .values([
          action('slot_window', ids.closed, '먼저 남긴 기록', at('09:00')),
          action('slot_window', ids.closed, '나중에 남긴 기록', at('10:00')),
          action('slot_window', ids.full, '다른 시간대', at('11:00')),
          action('slot', ids.closed, '다른 대상 종류', at('12:00')),
        ]);

      const detail = await selectAdminWindowDetail(tx, { windowId: ids.closed, now: NOW });
      expect(detail).toMatchObject({
        state: 'closed',
        closedAt: kst('2026-10-31T09:00:00'),
        closeReason: 'other',
        cells: [],
      });
      expect(detail!.adminActions.map((row) => row.memo)).toEqual([
        '나중에 남긴 기록',
        '먼저 남긴 기록',
      ]);
      expect(detail!.adminActions[0].adminName).toMatch(/^운영자 /);
      expect(
        await selectAdminWindowDetail(tx, { windowId: crypto.randomUUID(), now: NOW }),
      ).toBeNull();
    });
  });
});
