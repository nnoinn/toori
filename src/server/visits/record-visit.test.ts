// 방문·노쇼 처리(recordVisit). 원장님 로그인·입력 확인과 저장에 넘기는 값을 본다.
// 로그인·DB·시각은 가짜로 바꿔서 DB 없이 돈다. 실제 저장(예약·매물 바꾸기, 남의 샵, 두 번 처리)은 visit-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import { VISIT_ERRORS } from './errors';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const NOW = new Date('2026-11-01T03:00:00.000Z');

const state = vi.hoisted(() => ({
  auth: null as unknown,
  stored: null as unknown,
  calls: [] as { tx: unknown; input: unknown }[],
  noShowAlerts: [] as string[],
}));

vi.mock('@/server/notifications/alerts', () => ({
  notifyNoShow: (_db: unknown, reservationId: string) => {
    state.noShowAlerts.push(reservationId);
  },
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/auth', () => ({ requireOwner: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: unknown) => unknown) => run('tx') }),
}));
vi.mock('./visit-store', () => ({
  recordVisitInTx: async (tx: unknown, input: unknown) => {
    state.calls.push({ tx, input });
    return state.stored;
  },
}));

const { recordVisit } = await import('./record-visit');

beforeEach(() => {
  state.auth = ok({ userId: 'user-1', ownerId: 'owner-1', shopId: 'shop-1' });
  state.stored = ok({
    reservationId: RESERVATION,
    visitResult: 'no_show',
    recordedAt: NOW.toISOString(),
  });
  state.calls = [];
  state.noShowAlerts = [];
});

describe('recordVisit', () => {
  it('내 샵·로그인한 원장님·서버 시각으로 트랜잭션 안에서 저장하고 그 결과를 돌려준다', async () => {
    const result = await recordVisit({ reservationId: RESERVATION, result: 'no_show' });

    expect(result).toEqual(state.stored);
    expect(state.calls).toEqual([
      {
        tx: 'tx',
        input: {
          shopId: 'shop-1',
          reservationId: RESERVATION,
          result: 'no_show',
          recordedBy: 'user-1',
          now: NOW,
        },
      },
    ]);
    // 노쇼로 처리했으면 고객에게 알린다(reservation.no_show)
    expect(state.noShowAlerts).toEqual([RESERVATION]);
  });

  it('방문 완료도 그대로 넘긴다', async () => {
    await recordVisit({ reservationId: RESERVATION, result: 'visited' });
    expect(state.calls[0].input).toMatchObject({ result: 'visited' });
    expect(state.noShowAlerts).toEqual([]);
  });

  it('원장님 로그인이 아니면 그 실패를 그대로 돌려주고 저장하지 않는다', async () => {
    state.auth = fail('WRONG_MODE', '원장님 계정으로 들어와 주세요');
    expect(await recordVisit({ reservationId: RESERVATION, result: 'visited' })).toEqual(
      state.auth,
    );
    expect(state.calls).toEqual([]);
  });

  it('예약 번호 모양이 틀리면 RESERVATION_NOT_FOUND, 저장하지 않는다', async () => {
    expect(await recordVisit({ reservationId: 'not-a-uuid', result: 'visited' })).toEqual(
      fail('RESERVATION_NOT_FOUND', VISIT_ERRORS.RESERVATION_NOT_FOUND),
    );
    expect(state.calls).toEqual([]);
  });

  it('결과가 방문 완료·노쇼가 아니면 INVALID_INPUT, 저장하지 않는다', async () => {
    const result = await recordVisit({
      reservationId: RESERVATION,
      result: 'late' as 'visited',
    });
    expect(result).toEqual(fail('INVALID_INPUT', VISIT_ERRORS.INVALID_INPUT));
    expect(state.calls).toEqual([]);
  });

  it('저장이 막으면(이미 처리함 등) 그 실패를 그대로 돌려준다', async () => {
    state.stored = fail('ALREADY_RECORDED', VISIT_ERRORS.ALREADY_RECORDED);
    expect(await recordVisit({ reservationId: RESERVATION, result: 'visited' })).toEqual(
      state.stored,
    );
  });

  it('노쇼 저장이 막히면 고객 알림을 부르지 않는다', async () => {
    state.stored = fail('ALREADY_RECORDED', VISIT_ERRORS.ALREADY_RECORDED);
    await recordVisit({ reservationId: RESERVATION, result: 'no_show' });
    expect(state.noShowAlerts).toEqual([]);
  });
});
