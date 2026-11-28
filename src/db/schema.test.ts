import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

// 스키마 파일끼리 서로 가리키는 곳(주문 ↔ 쿠폰, 환불 → 정산 등)이 있어서,
// 실제로 불러왔을 때 모든 테이블과 FK 연결이 제대로 풀리는지 확인한다.
// .enableRLS()를 붙인 테이블은 타입 모양이 조금 달라서, 골라낸 뒤 PgTable 목록으로 다룬다
const tables = Object.values(schema).filter((value) => is(value, PgTable)) as unknown as PgTable[];

describe('DB 스키마 (docs/schema-v1.md W1a·W1b)', () => {
  it('테이블 35개가 모두 있다(운영자 열람 기록 #269, 정산 계좌 변경 기록 #295, 시간대 매물 #308, 합의 후 취소 요청 #320, 운영자 프로필 #372, 예약 작업 기록·정산 보류 #433, 회원 탈퇴 기록 #154, 관심 매물 #616 포함)', () => {
    expect(tables.map((t) => getTableName(t)).sort()).toEqual(
      [
        'account_withdrawals',
        'admin_access_logs',
        'admin_actions',
        'admin_profiles',
        'agreed_cancel_requests',
        'coupons',
        'cron_runs',
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
        'payout_account_changes',
        'payout_accounts',
        'penalty_collections',
        'profiles',
        'push_subscriptions',
        'refunds',
        'reservations',
        'settlement_holds',
        'settlement_items',
        'settlements',
        'shop_images',
        'shops',
        'slot_interests',
        'slot_window_menus',
        'slot_windows',
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
        expect(names.has(target), `${getTableName(table)} → ${target}`).toBe(true);
      }
    }
  });

  it('profiles는 로그인 정보(auth.users)를 FK로 가리키지 않는다(탈퇴 30일 뒤 로그인 정보를 지워도 기록은 남김, #154 (가))', () => {
    expect(getTableConfig(schema.profiles).foreignKeys).toEqual([]);
  });

  it('환불은 예약 없이도 남길 수 있다(자동 취소, #64)', () => {
    expect(schema.refunds.reservationId.notNull).toBe(false);
    expect(schema.refunds.orderId.notNull).toBe(true);
  });
});
