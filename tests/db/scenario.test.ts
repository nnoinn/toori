// 시나리오 명령(scripts/scenario.mjs)이 내 계정에 상황을 만들고, reset으로 깨끗이 지우는지 실제 DB로 확인한다.
// 로그인(W2) 전이라 로그인 콜백이 만들 profiles 한 줄을 테스트가 직접 만든다.

import type postgres from 'postgres';
import { expect, it } from 'vitest';

import { bookingRows, insertBookings } from '../../scripts/dev-db.mjs';
import { runScenario } from '../../scripts/scenario.mjs';
import { SEED_ACCOUNTS } from '../../scripts/seed-data.mjs';
import { seedDevData } from '../../scripts/seed.mjs';

import { describeDb, withRollbackSql } from './test-db';

const NOW = new Date('2026-11-01T05:03:00Z');
const EMAIL = 'me@test.invalid';

async function setup(sql: postgres.TransactionSql) {
  const userIds = Object.fromEntries(SEED_ACCOUNTS.map((a) => [a.key, crypto.randomUUID()]));
  await sql`insert into auth.users ${sql(SEED_ACCOUNTS.map((a) => ({ id: userIds[a.key], email: a.email })))}`;
  await seedDevData(sql, { now: NOW, userIds });
  const meId = crypto.randomUUID();
  await sql`insert into auth.users (id, email) values (${meId}, ${EMAIL})`;
  await sql`insert into profiles (id, email) values (${meId}, ${EMAIL})`;
  const run = (command: string, arg?: string) =>
    runScenario(sql, { email: EMAIL, command, arg, now: NOW });
  const counts = () => countsOf(sql, [...Object.values(userIds), meId]);
  return { meId, run, counts };
}

/**
 * 이 테스트가 만든 계정(시드 계정·나)에 딸린 줄만 센다. 시나리오 명령은 이 계정들의 샵·고객에만 쓴다.
 * DB 전체를 세면, 같은 테스트 DB에서 동시에 도는 다른 테스트(예: 홀딩 동시 테스트, 데이터를 저장했다가 지움)의 줄이
 * 세는 사이에 생기거나 사라져서 가끔 실패한다(10/29 main 검사)
 */
async function countsOf(sql: postgres.TransactionSql, userIds: string[]) {
  const [row] = await sql<{ slots: number; orders: number; shops: number; customers: number }[]>`
    with test_shops as (
      select s.id from shops s join owners o on o.id = s.owner_id where o.user_id in ${sql(userIds)}
    ), test_customers as (
      select id from customers where user_id in ${sql(userIds)}
    )
    select (select count(*)::int from slots where shop_id in (select id from test_shops)) as slots,
      (select count(*)::int from orders where customer_id in (select id from test_customers)) as orders,
      (select count(*)::int from test_shops) as shops,
      (select count(*)::int from test_customers) as customers`;
  return row;
}

describeDb('시나리오 명령 (실제 DB)', () => {
  it('로그인한 적 없는 이메일과 시드 계정은 거절한다', async () => {
    await withRollbackSql(async (sql) => {
      await setup(sql);
      await expect(
        runScenario(sql, { email: 'nobody@test.invalid', command: 'status', now: NOW }),
      ).rejects.toThrow('로그인한 기록이 없어요');
      await expect(
        runScenario(sql, { email: 'owner-a@seed.test', command: 'status', now: NOW }),
      ).rejects.toThrow('시드 계정');
    });
  });

  it('고객 상황을 만들고 reset하면 시나리오 전과 같아진다', async () => {
    await withRollbackSql(async (sql) => {
      const { meId, run, counts } = await setup(sql);
      const before = await counts();

      await run('customer-existing', 'a');
      const history = () => sql<{ n: number }[]>`
        select count(*)::int as n from reservations r join customers c on c.id = r.customer_id
        join slots sl on sl.id = r.slot_id join shops s on s.id = sl.shop_id
        join owners o on o.id = s.owner_id join profiles p on p.id = o.user_id
        where c.user_id = ${meId} and p.email = 'owner-a@seed.test' and r.status = 'completed'`;
      expect((await history())[0].n).toBe(1);
      expect((await run('customer-existing', 'a'))[0]).toContain('이미');

      await run('customer-new', 'a');
      expect((await history())[0].n).toBe(0);

      // 두 번 실행해도 한 벌만
      await run('my-reservations');
      await run('my-reservations');
      const mine = await sql<{ status: string; visit_result: string | null }[]>`
        select r.status, r.visit_result from reservations r join customers c on c.id = r.customer_id
        where c.user_id = ${meId} order by r.status, r.visit_result`;
      expect(mine.map((r) => `${r.status}:${r.visit_result ?? ''}`)).toEqual([
        'cancelled:',
        'completed:no_show',
        'completed:visited',
        'confirmed:',
      ]);

      const held = await run('hold-by-other');
      expect(held[0]).toContain('결제 중');

      const status = await run('status');
      expect(status.join('\n')).toContain('내 예약 4건');

      await run('reset');
      const after = await counts();
      expect(after).toEqual(before);
    });
  });

  it('my-coupons는 내 쿠폰 3장(기한 넉넉·3일 남음·지남)을 넣고, 다시 실행해도 한 벌, reset이 지운다(#300)', async () => {
    await withRollbackSql(async (sql) => {
      const { meId, run } = await setup(sql);
      const myCoupons = () => sql<
        { amount: number; expires_at: Date; used_order_id: string | null }[]
      >`
        select k.amount, k.expires_at, k.used_order_id from coupons k
        join customers c on c.id = k.customer_id where c.user_id = ${meId} order by k.expires_at`;

      await run('my-coupons');
      const lines = await run('my-coupons');
      expect(lines[0]).toContain('쿠폰 3장');
      const rows = await myCoupons();
      expect(rows.map((r) => [r.amount, r.used_order_id])).toEqual([
        [3000, null],
        [3000, null],
        [3000, null],
      ]);
      const DAY = 24 * 60 * 60 * 1000;
      expect(rows.map((r) => Math.round((r.expires_at.getTime() - NOW.getTime()) / DAY))).toEqual([
        -1, 3, 90,
      ]);
      expect((await run('status')).join('\n')).toContain('쓸 수 있는 쿠폰 2장');

      await run('reset');
      expect(await myCoupons()).toEqual([]);
    });
  });

  it('원장님 샵을 만들고 입점 상태를 바꾸고, 매물 상태 6가지를 만든 뒤 reset으로 지운다', async () => {
    await withRollbackSql(async (sql) => {
      const { meId, run, counts } = await setup(sql);
      const before = await counts();

      await expect(run('owner-slots')).rejects.toThrow('owner-shop approved');
      await run('owner-shop', 'pending');
      await run('owner-shop', 'rejected');
      const [rejected] = await sql<{ status: string; rejection_reason: string | null }[]>`
        select s.status, s.rejection_reason from shops s join owners o on o.id = s.owner_id
        where o.user_id = ${meId}`;
      expect(rejected.status).toBe('rejected');
      expect(rejected.rejection_reason).toBeTruthy();
      await expect(run('owner-shop', 'closed')).rejects.toThrow('pending');

      await run('owner-shop', 'approved');
      await run('owner-slots');
      await run('owner-slots');
      const slots = await sql<{ status: string; booked: number }[]>`
        select sl.status, (select count(*)::int from reservations r where r.slot_id = sl.id) as booked
        from slots sl join shops s on s.id = sl.shop_id join owners o on o.id = s.owner_id
        where o.user_id = ${meId}`;
      expect(new Set(slots.map((s) => s.status))).toEqual(
        new Set(['scheduled', 'published', 'closed', 'reserved', 'cancelled', 'completed']),
      );
      expect(slots).toHaveLength(8);
      for (const s of slots) {
        expect(s.booked).toBe(['reserved', 'cancelled', 'completed'].includes(s.status) ? 1 : 0);
      }

      await run('reset');
      expect(await counts()).toEqual(before);
      const [{ n }] = await sql<
        { n: number }[]
      >`select count(*)::int as n from owners where user_id = ${meId}`;
      expect(n).toBe(0);
    });
  });

  it('시나리오 취소 매물로 재등록한 매물(이어서 재등록한 것과 그 예약까지)도 owner-slots·reset이 같이 지운다 (#224)', async () => {
    await withRollbackSql(async (sql) => {
      const { meId, run, counts } = await setup(sql);
      const before = await counts();
      await run('owner-shop', 'approved');
      await run('owner-slots');

      // 원장님 화면의 재등록처럼 원래 매물을 가리키는 새 매물을 만든다. 시나리오 표시는 붙지 않는다
      const relist = async (fromId: string, status: string) => {
        const [row] = await sql`
          insert into slots (shop_id, menu_id, service_type, menu_name, list_price, duration_minutes,
            discount_rate, sale_price, new_customer_only, start_at, end_at, publish_at, status,
            created_by, relisted_from_slot_id)
          select shop_id, menu_id, service_type, menu_name, list_price, duration_minutes,
            discount_rate, sale_price, new_customer_only, start_at, end_at, publish_at, ${status},
            created_by, id
          from slots where id = ${fromId}
          returning *`;
        return row;
      };
      /** 시나리오의 취소 매물 → 재등록(또 취소) → 재등록(예약됨, 예약 하나) */
      const relistChain = async () => {
        const [cancelled] = await sql<{ id: string; customer_id: string }[]>`
          select sl.id, r.customer_id from slots sl join reservations r on r.slot_id = sl.id
          join shops s on s.id = sl.shop_id join owners o on o.id = s.owner_id
          where o.user_id = ${meId} and sl.status = 'cancelled' and sl.relisted_from_slot_id is null`;
        const first = await relist(cancelled.id, 'cancelled');
        const second = await relist(first.id, 'reserved');
        await insertBookings(sql, [
          bookingRows({
            slot: second,
            customerId: cancelled.customer_id,
            recordedBy: meId,
            now: NOW,
            paymentPrefix: 'test_relist_',
            policyVersion: 'test',
          }),
        ]);
        return [first.id as string, second.id as string];
      };
      const relistedLeft = async (ids: string[]) => {
        const [{ n }] = await sql<{ n: number }[]>`
          select (select count(*)::int from slots where id in ${sql(ids)})
            + (select count(*)::int from orders where slot_id in ${sql(ids)}) as n`;
        return n;
      };

      const relisted = await relistChain();
      await run('owner-slots');
      expect(await relistedLeft(relisted)).toBe(0);
      const [{ mine }] = await sql<{ mine: number }[]>`
        select count(*)::int as mine from slots sl join shops s on s.id = sl.shop_id
        join owners o on o.id = s.owner_id where o.user_id = ${meId}`;
      expect(mine).toBe(8);

      const again = await relistChain();
      await run('reset');
      expect(await relistedLeft(again)).toBe(0);
      expect(await counts()).toEqual(before);
    });
  });

  it('예약에 달린 기록(합의 후 취소 요청·이의제기·원장님 패널티·쿠폰·정산 전 항목)이 있어도 owner-slots·reset이 지운다(#301)', async () => {
    await withRollbackSql(async (sql) => {
      const { meId, run, counts } = await setup(sql);
      const before = await counts();
      await run('owner-shop', 'approved');

      /** 시나리오 예약에 실제 화면·서버가 남기는 기록을 붙이고, 붙인 예약·주문 id를 돌려준다 */
      const attachLinkedRows = async () => {
        const bookings = await sql<
          {
            reservation_id: string;
            order_id: string;
            customer_id: string;
            shop_id: string;
            slot_status: string;
          }[]
        >`
          select r.id as reservation_id, r.order_id, r.customer_id, sl.shop_id, sl.status as slot_status
          from reservations r join slots sl on sl.id = r.slot_id
          join shops s on s.id = sl.shop_id join owners o on o.id = s.owner_id
          where o.user_id = ${meId} and sl.relisted_from_slot_id is null`;
        const pick = (status: string) => {
          const found = bookings.find((b) => b.slot_status === status);
          if (!found) throw new Error(`시나리오에 ${status} 예약이 없어요`);
          return found;
        };
        const reserved = pick('reserved');
        const completed = pick('completed');
        const cancelled = pick('cancelled');
        const later = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);

        await sql`insert into agreed_cancel_requests ${sql({
          reservation_id: reserved.reservation_id,
          requested_by: meId,
          reason: 'style_mismatch',
          status: 'declined',
          requested_at: NOW,
          expires_at: later(1),
          responded_at: NOW,
        })}`;
        await sql`insert into disputes ${sql({
          reservation_id: completed.reservation_id,
          type: 'no_show',
          content: '시나리오 이의제기',
          status: 'open',
        })}`;
        await sql`insert into owner_penalties ${sql({
          shop_id: cancelled.shop_id,
          reservation_id: cancelled.reservation_id,
          amount: 5000,
        })}`;
        // 원장님 귀책 보상 쿠폰(원인 예약)과, 시나리오 주문에 쓴 쿠폰(주문과 쿠폰이 서로 가리킨다)
        await sql`insert into coupons ${sql({
          customer_id: cancelled.customer_id,
          amount: 3000,
          reason: 'owner_fault_compensation',
          source_reservation_id: cancelled.reservation_id,
          issued_at: NOW,
          expires_at: later(90),
        })}`;
        const [used] = await sql<{ id: string }[]>`insert into coupons ${sql({
          customer_id: completed.customer_id,
          amount: 3000,
          reason: 'owner_fault_compensation',
          issued_at: NOW,
          expires_at: later(90),
          used_order_id: completed.order_id,
          used_at: NOW,
        })} returning id`;
        await sql`update orders set coupon_id = ${used.id} where id = ${completed.order_id}`;
        // 정산 전(어느 정산에도 들어가지 않은) 정산 항목
        await sql`insert into settlement_items ${sql({
          shop_id: completed.shop_id,
          order_id: completed.order_id,
          kind: 'sale',
          base_amount: 10000,
          fee_rate: 0,
          fee_amount: 0,
          fee_vat: 0,
          payment_fee_rate: 0,
          payment_fee: 0,
          payment_fee_vat: 0,
          payout_amount: 10000,
          pg_fee_actual: 0,
        })}`;
        return {
          reservationIds: bookings.map((b) => b.reservation_id),
          orderIds: bookings.map((b) => b.order_id),
          couponIds: [used.id],
        };
      };
      const linkedLeft = async (ids: { reservationIds: string[]; orderIds: string[] }) => {
        const [row] = await sql<{ n: number }[]>`
          select (select count(*)::int from agreed_cancel_requests where reservation_id in ${sql(ids.reservationIds)})
            + (select count(*)::int from disputes where reservation_id in ${sql(ids.reservationIds)})
            + (select count(*)::int from owner_penalties where reservation_id in ${sql(ids.reservationIds)})
            + (select count(*)::int from settlement_items where order_id in ${sql(ids.orderIds)})
            + (select count(*)::int from coupons where source_reservation_id in ${sql(ids.reservationIds)}
                or used_order_id in ${sql(ids.orderIds)}) as n`;
        return row.n;
      };

      await run('owner-slots');
      const first = await attachLinkedRows();
      // 다시 만들기(owner-slots)는 지난 시나리오 예약을 기록과 함께 지우고 새로 만든다
      await run('owner-slots');
      expect(await linkedLeft(first)).toBe(0);
      // 쓴 쿠폰은 지우지 않고 다시 쓸 수 있게 돌려준다
      expect(
        await sql`select used_order_id, used_at from coupons where id in ${sql(first.couponIds)}`,
      ).toEqual([{ used_order_id: null, used_at: null }]);

      const second = await attachLinkedRows();
      await run('reset');
      expect(await linkedLeft(second)).toBe(0);
      expect(await counts()).toEqual(before);
    });
  });
});
