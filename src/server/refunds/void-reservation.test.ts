// 예약 무효 서버 함수(A-108, #423). 운영자만·원장님 요청 내용 필수·막는 조건·미리보기 금액과,
// 시작 저장(처리 기록 포함)·환불 진행에 넘기는 값·결과별 실패 코드·0원 무효를 본다.
// 로그인·DB·시각·저장·환불 진행·알림은 가짜로 바꾼다. 환불 진행은 void-flow.test.ts, 저장은 void-store.db.test.ts가 본다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

import type { VoidTarget } from './void-store';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const START = new Date('2026-11-15T06:00:00.000Z');
const NOW = new Date('2026-11-16T06:00:00.000Z');

const state = vi.hoisted(() => ({
  auth: null as unknown,
  target: null as unknown,
  locked: null as unknown,
  started: 'started' as string,
  startError: null as Error | null,
  outcome: null as unknown,
  finished: { couponReturned: false } as { couponReturned: boolean } | null,
  steps: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: async (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('./void-store', () => ({
  readVoidTarget: async (_db: unknown, reservationId: string) => {
    state.steps.push(['read', reservationId]);
    return state.target;
  },
  lockVoidTarget: async (tx: unknown, reservationId: string) => {
    state.steps.push(['lock', tx, reservationId]);
    return state.locked;
  },
  startVoid: async (_db: unknown, input: unknown) => {
    state.steps.push(['start', input]);
    if (state.startError) throw state.startError;
    return state.started;
  },
  finishVoid: async (tx: unknown, input: unknown) => {
    state.steps.push(['finish', tx, input]);
    return state.finished;
  },
}));
vi.mock('./void-flow', () => ({
  runVoidRefund: async (_db: unknown, input: unknown, now: Date) => {
    state.steps.push(['run', input, now]);
    return state.outcome;
  },
}));
vi.mock('@/server/notifications/alerts', () => ({
  notifyReservationVoided: (_db: unknown, reservationId: string, input: unknown) => {
    state.steps.push(['notify', reservationId, input]);
  },
}));

const { previewVoidReservation, voidReservation } = await import('./void-reservation');

/** 30시간 전 고객 취소로 70%(29,400원)를 돌려준 예약. 쓴 쿠폰 3,000원이 남아 있다 */
const TARGET: VoidTarget = {
  reservationId: RESERVATION,
  orderId: 'order-1',
  slotId: 'slot-1',
  paymentId: 'toori-1',
  status: 'cancelled',
  startAt: START,
  paidAmount: 42_000,
  refundedAmount: 29_400,
  usedCouponAmount: 3_000,
  voidedAt: null,
  settlementBundled: false,
  cancelInProgress: false,
  voidRequested: null,
};

const REQUEST = '  11/14 통화, 손님과 합의가 안 돼 전액 환불 요청  ';
const names = () => state.steps.map((step) => (step as unknown[])[0]);

beforeEach(() => {
  state.auth = ok({ userId: 'admin-user' });
  state.target = TARGET;
  state.locked = TARGET;
  state.started = 'started';
  state.startError = null;
  state.outcome = { state: 'finished', refundAmount: 12_600 };
  state.finished = { couponReturned: false };
  state.steps = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('previewVoidReservation', () => {
  it('실제 결제액, 이미 돌려준 금액, 이번에 돌려줄 남은 금액, 돌려줄 쿠폰을 보여준다', async () => {
    expect(await previewVoidReservation(RESERVATION)).toEqual(
      ok({
        reservationId: RESERVATION,
        voidable: true,
        blockReason: null,
        paidAmount: 42_000,
        refundedAmount: 29_400,
        refundAmount: 12_600,
        usedCouponAmount: 3_000,
      }),
    );
  });

  it.each([
    ['이미 무효', { voidedAt: NOW }, 'ALREADY_VOIDED'],
    ['정산에 묶임', { settlementBundled: true }, 'SETTLEMENT_BUNDLED'],
    ['다른 취소 진행 중', { cancelInProgress: true }, 'CANCEL_IN_PROGRESS'],
  ] as const)('%s이면 무효로 할 수 없다고 그 이유를 준다', async (_, extra, reason) => {
    state.target = { ...TARGET, ...extra };
    expect(await previewVoidReservation(RESERVATION)).toMatchObject({
      ok: true,
      data: { voidable: false, blockReason: reason },
    });
  });

  it('진행 중인 무효는 이어서 할 수 있고 저장한 금액을 보여준다(그 사이 정산에 묶였어도)', async () => {
    state.target = {
      ...TARGET,
      settlementBundled: true,
      voidRequested: { refundAmount: 12_600, requestedAt: NOW },
    };
    expect(await previewVoidReservation(RESERVATION)).toMatchObject({
      ok: true,
      data: { voidable: true, blockReason: null, refundAmount: 12_600 },
    });
  });

  it('운영자가 아니면 그 실패, 모양이 틀린 id·없는 예약은 RESERVATION_NOT_FOUND', async () => {
    state.target = null;
    expect(await previewVoidReservation(RESERVATION)).toMatchObject({
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    expect(await previewVoidReservation('not-a-uuid')).toMatchObject({
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    state.auth = fail('FORBIDDEN', '운영자만 볼 수 있어요');
    expect(await previewVoidReservation(RESERVATION)).toEqual(
      fail('FORBIDDEN', '운영자만 볼 수 있어요'),
    );
  });
});

describe('voidReservation', () => {
  it('남은 금액으로 무효를 시작하고(처리 기록 = 원장님 요청, 앞뒤 공백 뺌) 환불 진행에 넘긴다', async () => {
    expect(await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST })).toEqual(
      ok({ reservationId: RESERVATION, refundAmount: 12_600, voidedAt: NOW.toISOString() }),
    );
    expect(state.steps).toEqual([
      ['read', RESERVATION],
      [
        'start',
        {
          reservationId: RESERVATION,
          orderId: 'order-1',
          refundAmount: 12_600,
          adminId: 'admin-user',
          ownerRequest: '11/14 통화, 손님과 합의가 안 돼 전액 환불 요청',
          now: NOW,
        },
      ],
      ['run', expect.objectContaining({ ...TARGET, refundAmount: 12_600 }), NOW],
    ]);
  });

  it('원장님 요청 내용이 빈칸이거나 상한을 넘으면 DB를 보지 않는다', async () => {
    expect(
      await voidReservation({ reservationId: RESERVATION, ownerRequest: '   ' }),
    ).toMatchObject({ error: { code: 'REASON_REQUIRED' } });
    expect(
      await voidReservation({
        reservationId: RESERVATION,
        ownerRequest: '가'.repeat(ADMIN_REASON_LIMIT + 1),
      }),
    ).toMatchObject({ error: { code: 'REASON_TOO_LONG' } });
    expect(state.steps).toEqual([]);
  });

  it.each([
    ['이미 무효', { voidedAt: NOW }, 'ALREADY_VOIDED'],
    ['정산에 묶임', { settlementBundled: true }, 'SETTLEMENT_BUNDLED'],
    ['다른 취소 진행 중', { cancelInProgress: true }, 'CANCEL_IN_PROGRESS'],
  ] as const)('%s이면 시작하지 않고 %s', async (_, extra, code) => {
    state.target = { ...TARGET, ...extra };
    expect(
      await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST }),
    ).toMatchObject({ error: { code } });
    expect(names()).toEqual(['read']);
  });

  it('잠근 뒤 다시 보니 막혔으면(그 사이 정산에 묶임 등) 그 이유로 실패하고 환불하지 않는다', async () => {
    state.started = 'SETTLEMENT_BUNDLED';
    expect(
      await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST }),
    ).toMatchObject({ error: { code: 'SETTLEMENT_BUNDLED' } });
    expect(names()).not.toContain('run');
  });

  it('시작을 저장하지 못하면 환불하지 않고 REFUND_FAILED', async () => {
    state.startError = new Error('연결 끊김');
    expect(
      await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST }),
    ).toMatchObject({ error: { code: 'REFUND_FAILED' } });
    expect(names()).not.toContain('run');
  });

  it.each([
    [{ state: 'pending' }, 'VOID_FINISHING'],
    [{ state: 'failed' }, 'REFUND_FAILED'],
    [{ state: 'already' }, 'ALREADY_VOIDED'],
  ])('환불 진행 결과 %o이면 %s', async (outcome, code) => {
    state.outcome = outcome;
    expect(
      await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST }),
    ).toMatchObject({ error: { code } });
  });

  it('진행 중인 무효를 다시 누르면 시작하지 않고 저장한 금액으로 이어서 한다(그 사이 정산에 묶였어도)', async () => {
    state.target = {
      ...TARGET,
      refundedAmount: 0,
      settlementBundled: true,
      voidRequested: { refundAmount: 12_600, requestedAt: NOW },
    };
    expect(
      await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST }),
    ).toMatchObject({ ok: true, data: { refundAmount: 12_600 } });
    expect(names()).toEqual(['read', 'run']);
    expect(state.steps[1]).toEqual(['run', expect.objectContaining({ refundAmount: 12_600 }), NOW]);
  });

  describe('돌려줄 돈이 없는 무효(이미 다 돌려줬거나 0원 결제)', () => {
    const zero = { ...TARGET, refundedAmount: 42_000 };

    it('포트원을 부르지 않고 잠근 뒤 한 트랜잭션에서 끝내고(처리 기록 포함) 알린다', async () => {
      state.target = zero;
      state.locked = zero;
      state.finished = { couponReturned: true };
      expect(await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST })).toEqual(
        ok({ reservationId: RESERVATION, refundAmount: 0, voidedAt: NOW.toISOString() }),
      );
      expect(state.steps).toEqual([
        ['read', RESERVATION],
        ['lock', 'tx', RESERVATION],
        [
          'finish',
          'tx',
          {
            reservationId: RESERVATION,
            orderId: 'order-1',
            slotId: 'slot-1',
            startAt: START,
            refundAmount: 0,
            pgCancellationId: null,
            now: NOW,
            record: {
              adminId: 'admin-user',
              ownerRequest: '11/14 통화, 손님과 합의가 안 돼 전액 환불 요청',
            },
          },
        ],
        ['notify', RESERVATION, { refundAmount: 0, couponReturned: true }],
      ]);
    });

    it('잠근 뒤 다시 보니 막혔거나 이미 무효면 끝내지 않는다', async () => {
      state.target = zero;
      state.locked = { ...zero, cancelInProgress: true };
      expect(
        await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST }),
      ).toMatchObject({ error: { code: 'CANCEL_IN_PROGRESS' } });
      state.locked = zero;
      state.finished = null;
      expect(
        await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST }),
      ).toMatchObject({ error: { code: 'ALREADY_VOIDED' } });
      expect(names()).not.toContain('notify');
    });
  });

  it('운영자가 아니면 아무것도 하지 않는다', async () => {
    state.auth = fail('FORBIDDEN', '운영자만 할 수 있어요');
    expect(await voidReservation({ reservationId: RESERVATION, ownerRequest: REQUEST })).toEqual(
      fail('FORBIDDEN', '운영자만 할 수 있어요'),
    );
    expect(state.steps).toEqual([]);
  });
});
