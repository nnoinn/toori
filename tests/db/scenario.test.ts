// 시나리오 명령(scripts/scenario.mjs)이 내 계정에 상황을 만들고, reset으로 깨끗이 지우는지 실제 DB로 확인한다.
// 로그인(W2) 전이라 로그인 콜백이 만들 profiles 한 줄을 테스트가 직접 만든다.

import type postgres from 'postgres';
import { expect, it } from 'vitest';

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
      expect(slots).toHaveLength(7);
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
});
