// 시드 명령(scripts/seed.mjs)이 실제 DB 제약을 통과하고, 다시 넣어도 시드가 아닌 데이터는 남기는지 확인한다.

import type postgres from 'postgres';
import { describe, expect, it } from 'vitest';

import { SLOT_STATUSES } from '@/db/schema';

import { SEED_ACCOUNTS, SEED_SHOPS } from '../../scripts/seed-data.mjs';
import { salePrice, seedDevData } from '../../scripts/seed.mjs';

import { describeDb, withRollbackSql } from './test-db';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-01T05:03:00Z');

/** 테스트 DB의 auth.users에 시드 계정을 만든다(개발 DB에서는 Supabase 관리 기능이 만든다) */
async function createSeedUsers(sql: postgres.TransactionSql) {
  const userIds = Object.fromEntries(SEED_ACCOUNTS.map((a) => [a.key, crypto.randomUUID()]));
  await sql`insert into auth.users ${sql(SEED_ACCOUNTS.map((a) => ({ id: userIds[a.key], email: a.email })))}`;
  return userIds;
}

/** 시드가 아닌 원장님 샵 하나(팀원이 만든 데이터 대신) */
async function createOtherShop(sql: postgres.TransactionSql) {
  const userId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const shopId = crypto.randomUUID();
  await sql`insert into auth.users (id, email) values (${userId}, 'teammate@test.invalid')`;
  await sql`insert into profiles (id, email) values (${userId}, 'teammate@test.invalid')`;
  await sql`insert into owners (id, user_id, name, phone) values (${ownerId}, ${userId}, '팀원', '000-0000-0000')`;
  await sql`insert into shops ${sql({
    id: shopId,
    owner_id: ownerId,
    name: '팀원 샵',
    category: 'hair',
    phone: '000-0000-0000',
    road_address: '경기 안산시 단원구 테스트로 1',
    sido: '경기',
    sigungu: '안산시 단원구',
    sigungu_code: '41273',
    location: 'SRID=4326;POINT(126.83 37.32)',
    business_name: '팀원 샵',
    representative_name: '팀원',
    business_registration_number: '000-00-00000',
    opened_on: '2026-01-01',
    business_doc_path: 'test/doc.jpg',
  })}`;
  return shopId;
}

/** 시드 계정의 샵·메뉴·매물 수 */
async function countSeedRows(sql: postgres.TransactionSql, userIds: Record<string, string>) {
  const ids = Object.values(userIds);
  const [row] = await sql<{ shops: number; menus: number; slots: number }[]>`
    with seed_shops as (
      select s.id from shops s join owners o on o.id = s.owner_id where o.user_id in ${sql(ids)}
    )
    select
      (select count(*)::int from seed_shops) as shops,
      (select count(*)::int from menus where shop_id in (select id from seed_shops)) as menus,
      (select count(*)::int from slots where shop_id in (select id from seed_shops)) as slots`;
  return row;
}

describe('salePrice', () => {
  it('정가 × (1 − 할인율)에서 원 미만만 버린다 (S-203)', () => {
    expect(salePrice(33500, 30)).toBe(23450);
    expect(salePrice(33333, 10)).toBe(29999);
  });
});

describeDb('시드 데이터 (실제 DB)', () => {
  it('DB 제약을 통과하고, 다시 넣어도 같은 수이며 시드가 아닌 데이터는 남긴다', async () => {
    await withRollbackSql(async (sql) => {
      const userIds = await createSeedUsers(sql);
      const first = await seedDevData(sql, { now: NOW, userIds });
      expect(first.shops).toBe(SEED_SHOPS.length);
      expect(await countSeedRows(sql, userIds)).toEqual({
        shops: first.shops,
        menus: first.menus,
        slots: first.slots,
      });

      const otherShopId = await createOtherShop(sql);
      const second = await seedDevData(sql, { now: new Date(NOW.getTime() + HOUR), userIds });
      expect(second).toEqual(first);
      expect(await countSeedRows(sql, userIds)).toEqual({
        shops: first.shops,
        menus: first.menus,
        slots: first.slots,
      });
      const [other] = await sql`select count(*)::int as n from shops where id = ${otherShopId}`;
      expect(other.n).toBe(1);
    });
  });

  it('원장님 A의 샵에 매물 저장 상태 6가지가 모두 있고, 재등록·홀딩·할인가가 맞다', async () => {
    await withRollbackSql(async (sql) => {
      const userIds = await createSeedUsers(sql);
      await seedDevData(sql, { now: NOW, userIds });
      const slots = await sql<
        {
          id: string;
          status: string;
          list_price: number;
          discount_rate: number;
          sale_price: number;
          start_at: Date;
          relisted_from_slot_id: string | null;
          hold_expires_at: Date | null;
        }[]
      >`
        select sl.* from slots sl
        join shops s on s.id = sl.shop_id
        join owners o on o.id = s.owner_id
        where o.user_id = ${userIds['owner-a']}`;

      expect(new Set(slots.map((s) => s.status))).toEqual(new Set(SLOT_STATUSES));
      for (const s of slots) {
        expect(s.sale_price).toBe(salePrice(s.list_price, s.discount_rate));
      }

      const relisted = slots.find((s) => s.relisted_from_slot_id);
      const cancelled = slots.find((s) => s.id === relisted?.relisted_from_slot_id);
      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.start_at).toEqual(relisted?.start_at);

      const held = slots.filter((s) => s.hold_expires_at);
      expect(held).toHaveLength(1);
      expect(held[0].hold_expires_at).toEqual(new Date(NOW.getTime() + 10 * 60 * 1000));
    });
  });

  it('승인 대기·반려 샵이 하나씩 있고, 시흥시 샵에는 매물이 없다', async () => {
    await withRollbackSql(async (sql) => {
      const userIds = await createSeedUsers(sql);
      await seedDevData(sql, { now: NOW, userIds });
      const rows = await sql<
        { status: string; sigungu: string; rejection_reason: string | null; slots: number }[]
      >`
        select s.status, s.sigungu, s.rejection_reason,
          (select count(*)::int from slots where shop_id = s.id) as slots
        from shops s join owners o on o.id = s.owner_id
        where o.user_id in ${sql(Object.values(userIds))}`;

      expect(rows.filter((r) => r.status === 'pending')).toHaveLength(1);
      const rejected = rows.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(1);
      expect(rejected[0].rejection_reason).toBeTruthy();
      expect(rows.find((r) => r.sigungu === '시흥시')?.slots).toBe(0);
    });
  });

  it('예약된·완료된·취소된 매물마다 예약이 하나씩 있고, 고객 B·C 이력과 취소 환불이 맞다 (#18)', async () => {
    await withRollbackSql(async (sql) => {
      const userIds = await createSeedUsers(sql);
      const result = await seedDevData(sql, { now: NOW, userIds });
      const rows = await sql<
        {
          customer: string;
          shop_owner: string;
          slot_status: string;
          status: string;
          visit_result: string | null;
          code: string;
          amount: number;
          band: string | null;
          penalty_rate: number | null;
          refund_amount: number | null;
          penalty_amount: number | null;
        }[]
      >`
        select p.email as customer, op.email as shop_owner, sl.status as slot_status,
          r.status, r.visit_result, r.code, o.amount,
          rf.band, rf.penalty_rate, rf.refund_amount, rf.penalty_amount
        from reservations r
        join orders o on o.id = r.order_id
        join slots sl on sl.id = r.slot_id
        join shops s on s.id = sl.shop_id
        join owners ow on ow.id = s.owner_id
        join profiles op on op.id = ow.user_id
        join customers c on c.id = r.customer_id
        join profiles p on p.id = c.user_id
        left join refunds rf on rf.reservation_id = r.id
        where c.user_id in ${sql(Object.values(userIds))}`;

      expect(rows).toHaveLength(result.reservations);
      const [{ booked }] = await sql<{ booked: number }[]>`
        select count(*)::int as booked from slots sl join shops s on s.id = sl.shop_id
        join owners ow on ow.id = s.owner_id
        where ow.user_id in ${sql(Object.values(userIds))} and sl.status in ('reserved', 'completed', 'cancelled')`;
      expect(rows).toHaveLength(booked);

      const expected = { reserved: 'confirmed', completed: 'completed', cancelled: 'cancelled' };
      for (const r of rows) {
        expect(r.status).toBe(expected[r.slot_status as keyof typeof expected]);
        expect(r.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      }

      // 고객 A는 이력 없음, B는 원장님 A 샵 이용 이력(신규 고객 전용 매물이 안 보여야 한다)
      expect(rows.filter((r) => r.customer.startsWith('customer-a@'))).toHaveLength(0);
      expect(
        rows.some(
          (r) =>
            r.customer.startsWith('customer-b@') &&
            r.shop_owner.startsWith('owner-a@') &&
            r.status === 'completed',
        ),
      ).toBe(true);

      // 고객 C는 예정·이용 완료·취소가 하나씩
      const c = rows.filter((r) => r.customer.startsWith('customer-c@')).map((r) => r.status);
      expect(c.sort()).toEqual(['cancelled', 'completed', 'confirmed']);

      // 취소: 시작 24시간 이상 전이라 위약금 30%, 환불 + 위약금 = 결제액
      const cancelled = rows.find((r) => r.status === 'cancelled');
      expect(cancelled?.band).toBe('over_24h');
      expect(cancelled?.penalty_rate).toBe(30);
      expect((cancelled?.refund_amount ?? 0) + (cancelled?.penalty_amount ?? 0)).toBe(
        cancelled?.amount,
      );
      expect(rows.filter((r) => r.visit_result === 'no_show')).toHaveLength(1);
    });
  });
});
