// 운영자 기록 화면 조회(#372 5장)를 실제 DB(TEST_DATABASE_URL이 있을 때만)로 확인한다.

import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { adminAccessLogs, adminActions, adminProfiles, disputes, profiles } from '@/db/schema';

import {
  createTestCustomer,
  createTestReservation,
  createTestShop,
  createTestUser,
} from '../../../../tests/db/fixtures';
import { closeTestDb, describeDb, withRollback } from '../../../../tests/db/test-db';
import type { LogParams } from './format';
import { selectAccessLogs, selectActionLogs, selectAdminsForFilter } from './queries';

const at = (value: string) => new Date(`${value}+09:00`);
const ALL: Omit<LogParams, 'tab'> = {
  sort: 'new',
  admin: null,
  kind: null,
  target: null,
  from: null,
  to: null,
};

describeDb('운영자 기록 조회 (실제 DB)', () => {
  afterAll(closeTestDb);

  it('처리 기록: 운영자 이름·대상 이름(샵·예약번호·이의제기의 예약번호)을 붙이고, 운영자·한 일·대상·기간으로 거르고 정렬한다', async () => {
    await withRollback(async (tx) => {
      const adminA = await createTestUser(tx);
      const adminB = await createTestUser(tx);
      await tx.insert(adminProfiles).values({ userId: adminA, name: '가 운영자' });
      const shop = await createTestShop(tx, { status: 'approved', name: '기록 샵' });
      const { customerId } = await createTestCustomer(tx);
      const { reservation } = await createTestReservation(
        tx,
        shop,
        customerId,
        '09:00',
        '10:00',
        'completed',
        { visitResult: 'visited', visitRecordedAt: at('2026-11-01T11:00:00') },
      );
      const [dispute] = await tx
        .insert(disputes)
        .values({
          reservationId: reservation.id,
          type: 'after_start',
          content: '테스트 이의제기',
          status: 'open',
          channel: 'app',
          receivedAt: at('2026-11-02T10:00:00'),
        })
        .returning({ id: disputes.id });
      await tx.insert(adminActions).values([
        {
          adminId: adminA,
          action: 'shop.approve',
          targetType: 'shop',
          targetId: shop.shopId,
          memo: '서류 확인',
          createdAt: at('2026-11-10T10:00:00'),
        },
        {
          adminId: adminB,
          action: 'visit.override',
          targetType: 'reservation',
          targetId: reservation.id,
          createdAt: at('2026-11-12T10:00:00'),
        },
        {
          adminId: adminA,
          action: 'dispute.resolve',
          targetType: 'dispute',
          targetId: dispute.id,
          memo: 'no_change: 확인함',
          createdAt: at('2026-11-14T10:00:00'),
        },
      ]);

      const mine = (await selectActionLogs(tx, { ...ALL, admin: adminA })).rows;
      expect(mine.map((row) => [row.action, row.adminName, row.targetLabel])).toEqual([
        ['dispute.resolve', '가 운영자', reservation.code],
        ['shop.approve', '가 운영자', '기록 샵'],
      ]);
      expect(mine[1]).toMatchObject({
        memo: '서류 확인',
        targetType: 'shop',
        targetId: shop.shopId,
      });

      // 프로필이 없는 운영자는 이름이 비어 있다(화면은 "운영자")
      const theirs = (await selectActionLogs(tx, { ...ALL, admin: adminB })).rows;
      expect(theirs.map((row) => [row.adminName, row.targetLabel])).toEqual([
        [null, reservation.code],
      ]);

      const both: Omit<LogParams, 'tab'> = { ...ALL, sort: 'old' };
      const ids = async (filters: Partial<Omit<LogParams, 'tab'>>) =>
        (await selectActionLogs(tx, { ...both, ...filters })).rows
          .filter((row) => row.adminId === adminA || row.adminId === adminB)
          .map((row) => row.action);
      expect(await ids({})).toEqual(['shop.approve', 'visit.override', 'dispute.resolve']);
      expect(await ids({ kind: 'visit.override' })).toEqual(['visit.override']);
      expect(await ids({ target: 'dispute' })).toEqual(['dispute.resolve']);
      // 기간(한국 날짜, 둘 다 포함)
      expect(await ids({ from: '2026-11-11', to: '2026-11-13' })).toEqual(['visit.override']);
      expect(await ids({ from: '2026-11-14', to: '2026-11-14' })).toEqual(['dispute.resolve']);
    });
  });

  it('열람 기록: 접속 IP·화면·검색어와 대상 이름(고객 이름)을 보여주고, 목록은 대상 이름이 없다', async () => {
    await withRollback(async (tx) => {
      const adminId = await createTestUser(tx);
      await tx.insert(adminProfiles).values({ userId: adminId, name: '나 운영자' });
      const { customerId } = await createTestCustomer(tx);
      await tx.insert(adminAccessLogs).values([
        {
          adminId,
          action: 'view',
          targetType: 'customer',
          targetId: customerId,
          path: `/admin/users/customers/${customerId}`,
          ip: '203.0.113.7',
          createdAt: at('2026-11-10T10:00:00'),
        },
        {
          adminId,
          action: 'search',
          targetType: 'list',
          path: '/admin/users',
          query: '샘플',
          createdAt: at('2026-11-11T10:00:00'),
        },
      ]);

      const rows = (await selectAccessLogs(tx, { ...ALL, admin: adminId })).rows;
      expect(rows).toEqual([
        expect.objectContaining({
          action: 'search',
          targetType: 'list',
          targetId: null,
          targetLabel: null,
          path: '/admin/users',
          query: '샘플',
          ip: null,
          adminName: '나 운영자',
        }),
        expect.objectContaining({
          action: 'view',
          targetType: 'customer',
          targetLabel: '테스트 고객',
          ip: '203.0.113.7',
        }),
      ]);
      expect(
        (await selectAccessLogs(tx, { ...ALL, admin: adminId, kind: 'view' })).rows,
      ).toHaveLength(1);
    });
  });

  it('운영자 고르기: 지금 운영자와 그만뒀어도 프로필이 남은 운영자만, 이름과 함께', async () => {
    await withRollback(async (tx) => {
      const current = await createTestUser(tx);
      const former = await createTestUser(tx);
      const customer = await createTestUser(tx);
      await tx.update(profiles).set({ isAdmin: true }).where(eq(profiles.id, current));
      await tx.insert(adminProfiles).values({ userId: former, name: '그만둔 운영자' });

      const options = await selectAdminsForFilter(tx);
      const ours = options.filter((option) => [current, former, customer].includes(option.adminId));
      expect(ours).toEqual(
        expect.arrayContaining([
          { adminId: current, name: null },
          { adminId: former, name: '그만둔 운영자' },
        ]),
      );
      expect(ours.map((option) => option.adminId)).not.toContain(customer);
    });
  });
});
