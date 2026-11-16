// 운영자가 원장님 대신 하는 방문·노쇼 처리와 노쇼 되돌리기 (#373 ③, 11/16). 권한·입력·사유, 원장님 함수에 넘기는 값,
// 처리 기록을 같은 트랜잭션에서 성공했을 때만 남기는지, 알림을 누구에게 보내는지 본다.
// 로그인·DB·시각·알림은 가짜로 바꿔서 DB 없이 돈다(되돌리기 저장은 admin-visit-store.db.test.ts, 대신 처리 저장은 visit-store.db.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const NOW = new Date('2026-11-16T08:00:00.000Z');

const state = vi.hoisted(() => ({
  auth: null as unknown,
  shopId: 'shop-1' as string | null,
  visit: null as unknown,
  visitInputs: [] as unknown[],
  reverse: null as unknown,
  reverseInputs: [] as unknown[],
  actions: [] as unknown[],
  notified: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ name: 'db', transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('./admin-visit-store', () => ({
  readReservationShopId: async (tx: unknown) => {
    state.visitInputs.push({ shopReadIn: tx });
    return state.shopId;
  },
  reverseNoShowInTx: async (tx: unknown, input: unknown) => {
    state.reverseInputs.push({ tx, input });
    return state.reverse;
  },
}));
vi.mock('./visit-store', () => ({
  recordVisitInTx: async (tx: unknown, input: unknown) => {
    state.visitInputs.push({ tx, input });
    return state.visit;
  },
}));
vi.mock('@/server/admin/action-store', () => ({
  recordAdminAction: async (tx: unknown, row: unknown) => {
    state.actions.push({ tx, row });
  },
}));
vi.mock('@/server/notifications/alerts', () => ({
  notifyNoShow: (_db: unknown, id: string) => state.notified.push(['noShow', id]),
  notifyVisitRecordedByAdmin: (_db: unknown, id: string, result: string) =>
    state.notified.push(['recordedByAdmin', id, result]),
  notifyNoShowReversed: (_db: unknown, id: string) => state.notified.push(['reversed', id]),
}));

const { recordVisitAsAdmin, reverseNoShowAsAdmin } = await import('./admin-visit');

const RECORDED = {
  reservationId: RESERVATION,
  visitResult: 'no_show',
  recordedAt: NOW.toISOString(),
};

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.shopId = 'shop-1';
  state.visit = ok(RECORDED);
  state.visitInputs = [];
  state.reverse = ok({ reservationId: RESERVATION });
  state.reverseInputs = [];
  state.actions = [];
  state.notified = [];
});

describe('recordVisitAsAdmin', () => {
  it('운영자가 아니면 그 실패를 그대로 돌려주고 아무것도 하지 않는다', async () => {
    state.auth = fail('NOT_ADMIN', '운영자만 할 수 있어요');
    expect(
      await recordVisitAsAdmin({ reservationId: RESERVATION, result: 'no_show', reason: '요청' }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_ADMIN' } });
    expect(state.visitInputs).toEqual([]);
  });

  it('예약 id·결과 모양이 틀리거나 사유가 비면 처리하지 않는다', async () => {
    expect(
      await recordVisitAsAdmin({ reservationId: 'x', result: 'no_show', reason: '요청' }),
    ).toMatchObject({ error: { code: 'RESERVATION_NOT_FOUND' } });
    expect(
      await recordVisitAsAdmin({
        reservationId: RESERVATION,
        result: 'late' as never,
        reason: '요청',
      }),
    ).toMatchObject({ error: { code: 'INVALID_INPUT' } });
    expect(
      await recordVisitAsAdmin({ reservationId: RESERVATION, result: 'visited', reason: ' ' }),
    ).toMatchObject({ error: { code: 'REASON_REQUIRED', message: '사유를 적어 주세요' } });
    expect(state.visitInputs).toEqual([]);
  });

  it('그 예약의 샵으로 원장님 함수를 같은 트랜잭션에서 부르고(처리한 사람은 운영자), 처리 기록에 결과와 사유를 남긴다', async () => {
    expect(
      await recordVisitAsAdmin({
        reservationId: RESERVATION,
        result: 'no_show',
        reason: ' 원장님이 앱을 못 연다고 전화함 ',
      }),
    ).toEqual(ok(RECORDED));
    expect(state.visitInputs).toEqual([
      { shopReadIn: 'tx' },
      {
        tx: 'tx',
        input: {
          shopId: 'shop-1',
          reservationId: RESERVATION,
          result: 'no_show',
          recordedBy: 'admin-1',
          now: NOW,
        },
      },
    ]);
    expect(state.actions).toEqual([
      {
        tx: 'tx',
        row: {
          adminId: 'admin-1',
          action: 'visit.record',
          targetType: 'reservation',
          targetId: RESERVATION,
          memo: 'no_show: 원장님이 앱을 못 연다고 전화함',
        },
      },
    ]);
  });

  it('노쇼면 손님에게 원장님이 했을 때와 같은 노쇼 알림, 원장님에게 운영자가 처리했다는 알림을 보낸다. 방문 완료는 원장님에게만', async () => {
    await recordVisitAsAdmin({ reservationId: RESERVATION, result: 'no_show', reason: '요청' });
    expect(state.notified).toEqual([
      ['noShow', RESERVATION],
      ['recordedByAdmin', RESERVATION, 'no_show'],
    ]);

    state.notified = [];
    state.visit = ok({ ...RECORDED, visitResult: 'visited' });
    await recordVisitAsAdmin({ reservationId: RESERVATION, result: 'visited', reason: '요청' });
    expect(state.notified).toEqual([['recordedByAdmin', RESERVATION, 'visited']]);
  });

  it('원장님 함수가 막으면(시작 전·이미 처리함 등) 그 실패를 돌려주고 기록·알림을 남기지 않는다', async () => {
    state.visit = fail('TOO_EARLY', '서비스 시작 시각이 지나야 처리할 수 있어요');
    expect(
      await recordVisitAsAdmin({ reservationId: RESERVATION, result: 'no_show', reason: '요청' }),
    ).toMatchObject({ ok: false, error: { code: 'TOO_EARLY' } });
    expect(state.actions).toEqual([]);
    expect(state.notified).toEqual([]);
  });

  it('없는 예약이면 RESERVATION_NOT_FOUND이고 원장님 함수를 부르지 않는다', async () => {
    state.shopId = null;
    expect(
      await recordVisitAsAdmin({ reservationId: RESERVATION, result: 'visited', reason: '요청' }),
    ).toMatchObject({ error: { code: 'RESERVATION_NOT_FOUND' } });
    expect(state.visitInputs).toEqual([{ shopReadIn: 'tx' }]);
    expect(state.actions).toEqual([]);
  });
});

describe('reverseNoShowAsAdmin', () => {
  it('앞뒤 공백을 뺀 사유와 운영자로 트랜잭션 안에서 되돌리고, 손님·원장님에게 바로잡혔다는 알림을 보낸다', async () => {
    expect(
      await reverseNoShowAsAdmin({ reservationId: RESERVATION, reason: ' 잘못 누름 ' }),
    ).toEqual(ok({ reservationId: RESERVATION }));
    expect(state.reverseInputs).toEqual([
      { tx: 'tx', input: { reservationId: RESERVATION, adminId: 'admin-1', reason: '잘못 누름' } },
    ]);
    expect(state.notified).toEqual([['reversed', RESERVATION]]);
  });

  it('막히면(정산에 묶임 등) 그 실패를 돌려주고 알림을 보내지 않는다', async () => {
    state.reverse = fail('SETTLEMENT_BUNDLED', '이미 정산에 묶인 예약이라 되돌릴 수 없어요');
    expect(
      await reverseNoShowAsAdmin({ reservationId: RESERVATION, reason: '잘못 누름' }),
    ).toMatchObject({ ok: false, error: { code: 'SETTLEMENT_BUNDLED' } });
    expect(state.notified).toEqual([]);
  });

  it('운영자가 아니거나 사유가 비면 되돌리지 않는다', async () => {
    expect(await reverseNoShowAsAdmin({ reservationId: RESERVATION, reason: '' })).toMatchObject({
      error: { code: 'REASON_REQUIRED' },
    });
    state.auth = fail('NOT_ADMIN', '운영자만 할 수 있어요');
    expect(
      await reverseNoShowAsAdmin({ reservationId: RESERVATION, reason: '잘못 누름' }),
    ).toMatchObject({ error: { code: 'NOT_ADMIN' } });
    expect(state.reverseInputs).toEqual([]);
  });
});
