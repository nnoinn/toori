// 합의 후 취소 (X-208, #301, #320). 요청·상태 읽기·거절·동의(부분 환불)의 결과 모양, 내 예약·내 샵 예약 확인, 만료(시각으로 판단)·끝남,
// 실패 코드, 알림을 본다. 로그인·DB·시각은 가짜로 바꿔서 DB 없이 돈다. 실제 저장은 agreed-cancel-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { AgreedCancelRequestRow, AgreedCancelTarget } from './agreed-cancel-store';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const REQUEST = '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d';
const NOW = new Date('2026-11-12T03:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const state = vi.hoisted(() => ({
  owner: null as unknown,
  customer: null as unknown,
  now: new Date(),
  target: null as AgreedCancelTarget | null,
  latest: null as AgreedCancelRequestRow | null,
  /** readAgreedCancelRequest가 돌려줄 요청 */
  request: null as AgreedCancelRequestRow | null,
  steps: [] as unknown[],
  insertError: null as unknown,
  declined: true,
  alerts: [] as unknown[],
  marked: true,
  refundStarted: true,
  pgResult: null as unknown,
  lookup: null as unknown,
  finished: { refundAmount: 10_225 } as { refundAmount: number } | null | Error,
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({
  requireOwner: async () => state.owner,
  requireCustomer: async () => state.customer,
}));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/lib/db-error', () => ({
  violatedConstraint: (error: unknown) => (error as { constraint?: string }).constraint,
}));
vi.mock('@/server/notifications/alerts', () => ({
  notifyAgreedCancelRequested: (_db: unknown, input: unknown) =>
    state.alerts.push(['requested', input]),
  notifyAgreedCancelResult: (_db: unknown, input: unknown) => state.alerts.push(['result', input]),
}));
vi.mock('./agreed-cancel-store', () => ({
  readAgreedCancelTarget: async (db: unknown, id: string, options?: unknown) => {
    state.steps.push(['readTarget', db, options]);
    return state.target && state.target.reservationId === id ? state.target : null;
  },
  readLatestAgreedCancelRequest: async () => state.latest,
  readAgreedCancelRequest: async (_db: unknown, id: string) =>
    state.request && state.request.requestId === id && state.target
      ? { request: state.request, target: state.target }
      : null,
  expireReservationRequests: async (tx: unknown, input: unknown) => {
    state.steps.push(['expire', tx, input]);
  },
  insertAgreedCancelRequest: async (tx: unknown, input: unknown) => {
    state.steps.push(['insert', tx, input]);
    if (state.insertError) throw state.insertError;
    return { requestId: REQUEST };
  },
  declineAgreedCancelRequest: async (_db: unknown, input: unknown) => {
    state.steps.push(['decline', input]);
    return state.declined;
  },
  markAgreedCancelRequest: async (tx: unknown, input: unknown) => {
    state.steps.push(['mark', tx, input]);
    return state.marked;
  },
  reopenAgreedRequest: async (_db: unknown, input: unknown) => {
    state.steps.push(['reopen', input]);
  },
}));
vi.mock('./refund-store', () => ({
  readRefundTarget: async () =>
    state.target && {
      reservationId: state.target.reservationId,
      orderId: 'order-1',
      slotId: 'slot-1',
      paymentId: 'toori-1',
      paidAmount: state.target.paidAmount,
      salePrice: state.target.salePrice,
      couponAmount: state.target.couponAmount,
      startAt: state.target.startAt,
      status: state.target.status,
      requested: null,
    },
  requestCancelRefund: async (tx: unknown, input: unknown) => {
    state.steps.push(['requestRefund', tx, input]);
    return state.refundStarted;
  },
  clearRequestedCancel: async (_db: unknown, reservationId: string) => {
    state.steps.push(['clear', reservationId]);
  },
}));
vi.mock('./refund-payment', () => ({
  AGREED_CANCEL_REASON: '합의 후 취소',
  refundPayment: async (input: unknown) => {
    state.steps.push(['pg', input]);
    return state.pgResult;
  },
}));
vi.mock('./finish-cancel', () => ({
  lookUpRefund: async () => state.lookup,
  finishCancel: async (_db: unknown, request: unknown, refund: unknown) => {
    state.steps.push(['finish', request, refund]);
    if (state.finished instanceof Error) throw state.finished;
    return state.finished;
  },
}));

const { getAgreedCancelRequest, getAgreedCancelStatus, requestAgreedCancel, respondAgreedCancel } =
  await import('./agreed-cancel');

const CONFIRMED: AgreedCancelTarget = {
  reservationId: RESERVATION,
  customerId: 'customer-1',
  shopId: 'shop-1',
  status: 'confirmed',
  visitResult: null,
  startAt: new Date(NOW.getTime() + 2 * HOUR),
  salePrice: 23_450,
  paidAmount: 20_450,
  couponAmount: 3000,
};

function pending(extra: Partial<AgreedCancelRequestRow> = {}): AgreedCancelRequestRow {
  return {
    requestId: REQUEST,
    reservationId: RESERVATION,
    reason: 'style_mismatch',
    reasonText: null,
    status: 'requested',
    requestedAt: new Date(NOW.getTime() - HOUR),
    expiresAt: new Date(NOW.getTime() + 23 * HOUR),
    respondedAt: null,
    ...extra,
  };
}

beforeEach(() => {
  state.owner = ok({ userId: 'owner-user', ownerId: 'owner-1', shopId: 'shop-1' });
  state.customer = ok({ userId: 'customer-user', customerId: 'customer-1' });
  state.now = NOW;
  state.target = { ...CONFIRMED };
  state.latest = null;
  state.request = null;
  state.steps = [];
  state.insertError = null;
  state.declined = true;
  state.alerts = [];
  state.marked = true;
  state.refundStarted = true;
  state.pgResult = { ok: true, cancellationId: 'c-1', amount: 10_225 };
  state.lookup = { state: 'none' };
  state.finished = { refundAmount: 10_225 };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getAgreedCancelStatus (원장님)', () => {
  it('요청한 적 없으면 none, 요청할 수 있고 기준 금액은 판매가 × 50%', async () => {
    expect(await getAgreedCancelStatus(RESERVATION)).toEqual(
      ok({
        reservationId: RESERVATION,
        status: 'none',
        canRequest: true,
        request: null,
        baseAmount: 11_725,
        serverNow: NOW.toISOString(),
      }),
    );
  });

  it('답을 기다리면 요청할 수 없고, 만료 시각이 지났으면(저장 전이라도) expired로 보고 다시 요청할 수 있다', async () => {
    state.latest = pending();
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: {
        status: 'requested',
        canRequest: false,
        request: { requestId: REQUEST, reason: 'style_mismatch', respondedAt: null },
      },
    });
    state.latest = pending({ expiresAt: NOW });
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: { status: 'expired', canRequest: true, request: { respondedAt: NOW.toISOString() } },
    });
  });

  it('거절된 요청 뒤에는 다시 요청할 수 있다, 예약이 바뀐 요청은 closed', async () => {
    state.latest = pending({ status: 'declined', respondedAt: NOW });
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: { status: 'declined', canRequest: true },
    });
    state.latest = pending();
    state.target = { ...CONFIRMED, status: 'completed', visitResult: 'visited' };
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: { status: 'closed', canRequest: false },
    });
  });

  it('내 샵 예약이 아니면 RESERVATION_NOT_FOUND, 원장님이 아니면 그 실패', async () => {
    state.target = { ...CONFIRMED, shopId: 'shop-2' };
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    state.owner = fail('FORBIDDEN', '권한이 없어요');
    expect(await getAgreedCancelStatus(RESERVATION)).toEqual(fail('FORBIDDEN', '권한이 없어요'));
  });
});

describe('requestAgreedCancel (원장님)', () => {
  it('예약을 잠그고, 지난 요청을 만료로 바꾼 뒤 새 요청(24시간)을 저장하고 고객에게 알린다', async () => {
    expect(
      await requestAgreedCancel({
        reservationId: RESERVATION,
        reason: 'other',
        reasonText: '  손님이 다음에 오기로 했어요 ',
      }),
    ).toEqual(
      ok({
        requestId: REQUEST,
        requestedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
      }),
    );
    expect(state.steps).toEqual([
      ['readTarget', 'tx', { lock: true }],
      ['expire', 'tx', { reservationId: RESERVATION, now: NOW }],
      [
        'insert',
        'tx',
        {
          reservationId: RESERVATION,
          requestedBy: 'owner-user',
          reason: 'other',
          reasonText: '손님이 다음에 오기로 했어요',
          requestedAt: NOW,
          expiresAt: new Date(NOW.getTime() + 24 * HOUR),
        },
      ],
    ]);
    expect(state.alerts).toEqual([
      ['requested', { reservationId: RESERVATION, requestId: REQUEST }],
    ]);
  });

  it('답을 기다리는 요청이 이미 있으면(unique) ALREADY_REQUESTED이고 알리지 않는다', async () => {
    state.insertError = { constraint: 'agreed_cancel_requests_pending_unique' };
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'style_mismatch' }),
    ).toMatchObject({ ok: false, error: { code: 'ALREADY_REQUESTED' } });
    expect(state.alerts).toEqual([]);
  });

  it('예정 예약이 아니면 NOT_REQUESTABLE, 남의 샵 예약이면 RESERVATION_NOT_FOUND, 사유가 틀리면 INVALID_INPUT', async () => {
    state.target = { ...CONFIRMED, status: 'cancelled' };
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'style_mismatch' }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_REQUESTABLE' } });
    state.target = { ...CONFIRMED, shopId: 'shop-2' };
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'style_mismatch' }),
    ).toMatchObject({ ok: false, error: { code: 'RESERVATION_NOT_FOUND' } });
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'other', reasonText: ' ' }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(state.alerts).toEqual([]);
  });
});

describe('getAgreedCancelRequest (고객)', () => {
  it('답을 기다리는 요청 카드: 환불은 실제 결제액 × 50%', async () => {
    state.latest = pending();
    expect(await getAgreedCancelRequest(RESERVATION)).toEqual(
      ok({
        requestId: REQUEST,
        reason: 'style_mismatch',
        reasonText: null,
        refundAmount: 10_225,
        paidAmount: 20_450,
        couponAmount: 3000,
        requestedAt: new Date(NOW.getTime() - HOUR).toISOString(),
        expiresAt: new Date(NOW.getTime() + 23 * HOUR).toISOString(),
        serverNow: NOW.toISOString(),
      }),
    );
  });

  it('요청 없음·만료 시각 지남·거절·예약 바뀜이면 null, 내 예약이 아니면 REQUEST_NOT_FOUND', async () => {
    expect(await getAgreedCancelRequest(RESERVATION)).toEqual(ok(null));
    state.latest = pending({ expiresAt: NOW });
    expect(await getAgreedCancelRequest(RESERVATION)).toEqual(ok(null));
    state.latest = pending({ status: 'declined' });
    expect(await getAgreedCancelRequest(RESERVATION)).toEqual(ok(null));
    state.latest = pending();
    state.target = { ...CONFIRMED, status: 'cancelled' };
    expect(await getAgreedCancelRequest(RESERVATION)).toEqual(ok(null));
    state.target = { ...CONFIRMED, customerId: 'customer-2' };
    expect(await getAgreedCancelRequest(RESERVATION)).toMatchObject({
      ok: false,
      error: { code: 'REQUEST_NOT_FOUND' },
    });
  });
});

describe('respondAgreedCancel (고객)', () => {
  beforeEach(() => {
    state.request = pending();
  });

  it('동의하지 않으면 거절로 바꾸고 원장님에게 알린다(예약은 그대로)', async () => {
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: false })).toEqual(
      ok({ agreed: false, reservationId: RESERVATION, declinedAt: NOW.toISOString() }),
    );
    expect(state.steps).toEqual([['decline', { requestId: REQUEST, now: NOW }]]);
    expect(state.alerts).toEqual([
      ['result', { reservationId: RESERVATION, requestId: REQUEST, result: 'declined' }],
    ]);
  });

  it('만료 시각 뒤에는 막는다(저장 전이라도), 이미 답함·예약 바뀜도 막는다', async () => {
    const codeOf = async () => {
      const result = await respondAgreedCancel({ requestId: REQUEST, agree: false });
      return result.ok ? 'ok' : result.error.code;
    };
    state.request = pending({ expiresAt: NOW });
    expect(await codeOf()).toBe('REQUEST_EXPIRED');
    state.request = pending({ status: 'declined' });
    expect(await codeOf()).toBe('ALREADY_RESPONDED');
    state.request = pending();
    state.target = { ...CONFIRMED, status: 'completed', visitResult: 'no_show' };
    expect(await codeOf()).toBe('RESERVATION_CHANGED');
    expect(state.steps).toEqual([]);
    expect(state.alerts).toEqual([]);
  });

  it('저장하는 순간 상태가 바뀌었으면(동시에 누름) 이유를 다시 읽어 준다', async () => {
    state.declined = false;
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: false })).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_RESPONDED' },
    });
    expect(state.alerts).toEqual([]);
  });

  it('동의: 요청을 동의로·환불 기록을 진행 중으로(한 트랜잭션) → 결제액 50% 환불 → 예약 취소', async () => {
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toEqual(
      ok({
        agreed: true,
        reservationId: RESERVATION,
        refundAmount: 10_225,
        cancelledAt: NOW.toISOString(),
      }),
    );
    const requested = {
      reason: 'agreed_cancel',
      band: null,
      penaltyRate: 50,
      refundAmount: 10_225,
      penaltyAmount: 10_225,
      requestedAt: NOW,
    };
    expect(state.steps).toEqual([
      ['readTarget', 'tx', { lock: true }],
      ['mark', 'tx', { requestId: REQUEST, now: NOW }],
      ['requestRefund', 'tx', { reservationId: RESERVATION, orderId: 'order-1', ...requested }],
      [
        'pg',
        { paymentId: 'toori-1', paidAmount: 20_450, refundAmount: 10_225, reason: '합의 후 취소' },
      ],
      [
        'finish',
        expect.objectContaining({ reservationId: RESERVATION, paymentId: 'toori-1', ...requested }),
        { ok: true, cancellationId: 'c-1', amount: 10_225 },
      ],
    ]);
  });

  it('동의를 저장하는 순간 답했거나 만료됐으면 이유를 다시 읽어 주고 환불하지 않는다', async () => {
    state.marked = false;
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_RESPONDED' },
    });
    expect(state.steps.map((step) => (step as unknown[])[0])).not.toContain('pg');
  });

  it('손님 직접 취소 환불이 먼저 들어와 있으면 RESERVATION_CHANGED(환불은 한 번)', async () => {
    state.refundStarted = false;
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_CHANGED' },
    });
    expect(state.steps.map((step) => (step as unknown[])[0])).not.toContain('pg');
  });

  it('결제사가 거절했고 돌아간 돈이 없으면 진행 중 표시를 지우고 요청을 다시 답 기다림으로, REFUND_FAILED', async () => {
    state.pgResult = { ok: false, reason: 'rejected' };
    state.lookup = { state: 'none' };
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'REFUND_FAILED' },
    });
    expect(state.steps.slice(-2)).toEqual([
      ['clear', RESERVATION],
      ['reopen', { reservationId: RESERVATION, now: NOW }],
    ]);
  });

  it('결과를 모르거나 처리 중이면 CANCEL_FINISHING(정리 작업이 마무리)', async () => {
    state.pgResult = { ok: false, reason: 'unavailable' };
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'CANCEL_FINISHING' },
    });
    state.steps = [];
    state.pgResult = { ok: false, reason: 'rejected' };
    state.lookup = { state: 'pending' };
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'CANCEL_FINISHING' },
    });
  });

  it('환불 뒤 저장이 실패하면 CANCEL_FINISHING, 예약이 이미 바뀌었으면 RESERVATION_CHANGED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.finished = new Error('db down');
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'CANCEL_FINISHING' },
    });
    state.finished = null;
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_CHANGED' },
    });
  });

  it('동의한 환불이 아직 끝나지 않았으면(다시 누름) CANCEL_FINISHING', async () => {
    state.request = pending({ status: 'agreed', respondedAt: NOW });
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'CANCEL_FINISHING' },
    });
    expect(state.steps).toEqual([]);
  });

  it('남의 예약 요청이거나 모양이 틀리면 REQUEST_NOT_FOUND', async () => {
    state.target = { ...CONFIRMED, customerId: 'customer-2' };
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: false })).toMatchObject({
      ok: false,
      error: { code: 'REQUEST_NOT_FOUND' },
    });
    expect(
      await respondAgreedCancel({ requestId: 'nope', agree: 'yes' as unknown as boolean }),
    ).toMatchObject({ ok: false, error: { code: 'REQUEST_NOT_FOUND' } });
  });

  it('실패 흉내 스위치(로컬 개발만): 환불 실패 문구는 예약 취소와 같다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_AGREED_CANCEL_FAILURE', 'respondAgreedCancel:REFUND_FAILED');
    expect(await respondAgreedCancel({ requestId: REQUEST, agree: true })).toEqual({
      ok: false,
      error: {
        code: 'REFUND_FAILED',
        message: '환불하지 못했어요. 예약은 그대로예요. 잠시 후 다시 시도해 주세요',
      },
    });
  });
});
