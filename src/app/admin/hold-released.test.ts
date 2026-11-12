// 운영자 목록이 결제 없이 비운 시간대 칸(hold_released)을 빼는지 본다(#308 ④). DB 없이 만들어진 SQL만 본다.
// 실제로 빠지는지는 reservations·users의 queries.db.test.ts가 실제 DB로 본다.

import { drizzle } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/auth/account-store', () => ({ readOptionalConsents: async () => ({}) }));

const { selectSlots } = await import('./reservations/queries');
const { selectOwners } = await import('./users/queries');

type Query = { sql: string; params: unknown[] };

/** 쿼리를 실행하지 않고 SQL만 모으는 db. 끝까지 만든 쿼리를 await하면 빈 결과를 준다 */
function capturingDb() {
  // 실제 getDb와 같은 이름 규칙(snake_case)
  const real = drizzle.mock({ casing: 'snake_case' });
  const queries: Query[] = [];
  const wrap = (builder: object): object =>
    new Proxy(builder, {
      get(target, prop) {
        if (prop === 'then') {
          queries.push((target as { toSQL(): Query }).toSQL());
          return (resolve: (rows: unknown[]) => void) => resolve([]);
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function'
          ? (...args: unknown[]) => wrap((value as (...a: unknown[]) => object).apply(target, args))
          : value;
      },
    });
  const db = {
    select: (...args: unknown[]) => wrap((real.select as (...a: unknown[]) => object)(...args)),
  };
  return { db: db as never, queries };
}

describe('결제 없이 비운 시간대 칸(hold_released)은 운영자 목록에서 뺀다', () => {
  it('매물 탭(A-103)은 어느 상태로 걸러도 where에서 뺀다', async () => {
    for (const filter of ['all', 'closed'] as const) {
      const { db, queries } = capturingDb();
      await selectSlots(db, { filter, query: '', now: new Date('2026-11-12T12:00:00+09:00') });
      const [query] = queries;
      expect(query.sql).toMatch(
        /where .*"slots"\."close_reason" is null or "slots"\."close_reason" <> \$\d+/,
      );
      expect(query.params).toContain('hold_released');
    }
  });

  it('원장님 목록(A-102)의 매물 수는 join 조건에서 빼서, 매물이 없는 원장님 줄은 그대로 남는다', async () => {
    const { db, queries } = capturingDb();
    await selectOwners(db, '');
    const [query] = queries;
    expect(query.sql).toMatch(
      /left join "slots" on \("slots"\."shop_id" = "shops"\."id" and \("slots"\."close_reason" is null or "slots"\."close_reason" <> \$\d+\)\)/,
    );
    expect(query.params).toContain('hold_released');
  });
});
