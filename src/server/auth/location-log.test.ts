// logLocationUse가 위치 이용 사실을 남기는지 확인한다(#47 7장).
// 실제 DB 테스트는 TEST_DATABASE_URL이 있을 때만 돈다(CI에서는 늘 돈다). 실패 처리 테스트는 DB 없이 돈다.
// 로그인한 사람은 가짜로 넣는다(로그인 세션은 요청 안에서만 읽을 수 있다).

import { and, eq, isNull } from 'drizzle-orm';
import { authUsers } from 'drizzle-orm/supabase';
import { afterAll, beforeEach, expect, it, vi } from 'vitest';

import { getDb } from '@/db';
import { type LocationUsePurpose, locationUseLogs, profiles } from '@/db/schema';

import {
  closeTestDb,
  describeDb,
  violatedConstraint,
  withRollback,
} from '../../../tests/db/test-db';
import { logLocationUse } from './location-log';

const current = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock('./current-account', () => ({
  getCurrentAccount: async () => (current.userId ? { userId: current.userId } : null),
}));

beforeEach(() => {
  current.userId = null;
});

it('저장에 실패하면 에러를 던진다(기록 없이 위치를 쓰지 않게)', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.resetModules();
  vi.doMock('@/db', () => ({
    getDb: () => ({
      insert: () => ({ values: () => Promise.reject(new Error('connection refused')) }),
    }),
  }));
  const { logLocationUse: logWithBrokenDb } = await import('./location-log');

  await expect(logWithBrokenDb('nearby_search')).rejects.toThrow(
    '위치 이용 기록을 남기지 못했어요',
  );

  vi.doUnmock('@/db');
  vi.restoreAllMocks();
});

describeDb('logLocationUse (실제 DB)', () => {
  afterAll(async () => {
    await getDb().$client.end();
    await closeTestDb();
  });

  it('부를 때마다 목적별로 한 줄씩 남기고, 로그인하지 않았으면 사용자는 비운다', async () => {
    // getDb()로 저장한 기록은 되돌려지지 않으므로 늘어난 개수로 확인한다
    const countOf = (purpose: LocationUsePurpose) =>
      getDb().$count(
        locationUseLogs,
        and(eq(locationUseLogs.purpose, purpose), isNull(locationUseLogs.userId)),
      );
    const nearbyBefore = await countOf('nearby_search');
    const mapBefore = await countOf('map');

    await logLocationUse('nearby_search');
    await logLocationUse('map');
    await logLocationUse('nearby_search');

    expect(await countOf('nearby_search')).toBe(nearbyBefore + 2);
    expect(await countOf('map')).toBe(mapBefore + 1);
  });

  it('로그인했으면 누가 썼는지 남긴다', async () => {
    const userId = crypto.randomUUID();
    await getDb().insert(authUsers).values({ id: userId });
    await getDb()
      .insert(profiles)
      .values({ id: userId, email: `${userId}@test.invalid` });
    current.userId = userId;

    await logLocationUse('nearby_search');

    expect(await getDb().$count(locationUseLogs, eq(locationUseLogs.userId, userId))).toBe(1);
  });

  it('목록에 없는 목적은 DB가 막는다', async () => {
    await withRollback(async (tx) => {
      expect(
        await violatedConstraint(tx, (t) =>
          t.insert(locationUseLogs).values({ purpose: 'tracking' }),
        ),
      ).toBe('location_use_logs_purpose_check');
    });
  });
});
