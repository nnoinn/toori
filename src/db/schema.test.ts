import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

// 스키마 파일끼리 서로 가리키는 곳(주문 ↔ 쿠폰, 환불 → 정산 등)이 있어서,
// 실제로 불러왔을 때 모든 테이블과 FK 연결이 제대로 풀리는지 확인한다.
// .enableRLS()를 붙인 테이블은 타입 모양이 조금 달라서, 골라낸 뒤 PgTable 목록으로 다룬다
const tables = Object.values(schema).filter((value) => is(value, PgTable)) as unknown as PgTable[];

describe('DB 스키마 (docs/schema-v1.md W1a·W1b)', () => {
  it('테이블 25개가 모두 있다', () => {
    expect(tables.map((t) => getTableName(t)).sort()).toEqual(
      [
        'admin_actions',
        'coupons',
        'customers',
        'disputes',
        'favorites',
        'interest_areas',
        'location_use_logs',
        'menus',
        'notifications',
        'orders',
        'owner_penalties',
        'owners',
        'payout_accounts',
        'penalty_collections',
        'profiles',
        'push_subscriptions',
        'refunds',
        'reservations',
        'settlement_items',
        'settlements',
        'shop_images',
        'shops',
        'slots',
        'terms_agreements',
        'webhook_events',
      ].sort(),
    );
  });

  it('모든 테이블에 RLS가 켜져 있다(기본 거부)', () => {
    for (const table of tables) {
      expect(getTableConfig(table).enableRLS, getTableName(table)).toBe(true);
    }
  });

  it('모든 FK가 실제 테이블을 가리킨다(서로 가리키는 파일도 풀린다)', () => {
    const names = new Set(tables.map((t) => getTableName(t)));
    for (const table of tables) {
      for (const fk of getTableConfig(table).foreignKeys) {
        const target = getTableName(fk.reference().foreignTable);
        // profiles만 Supabase 로그인 사용자(auth.users)를 가리킨다
        expect(names.has(target) || target === 'users', `${getTableName(table)} → ${target}`).toBe(
          true,
        );
      }
    }
  });

  it('환불은 예약 없이도 남길 수 있다(자동 취소, #64)', () => {
    expect(schema.refunds.reservationId.notNull).toBe(false);
    expect(schema.refunds.orderId.notNull).toBe(true);
  });
});
