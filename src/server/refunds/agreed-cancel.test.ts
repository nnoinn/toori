// 합의 후 취소 가짜 결과 버전 (#301). 결과 모양, 내 예약·내 샵 예약 확인, 상태 스위치와 실패 스위치, 금액을 본다.
// 로그인·DB 읽기·시각은 가짜로 바꿔서 DB 없이 돈다. 예약 값 읽기는 agreed-cancel-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { AgreedCancelTarget } from './agreed-cancel-store';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const NOW = new Date('2026-11-11T03:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const state = vi.hoisted(() => ({
  owner: null as unknown,
  customer: null as unknown,
  now: new Date(),
  target: null as AgreedCancelTarget | null,
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({
  requireOwner: async () => state.owner,
  requireCustomer: async () => state.customer,
}));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('./agreed-cancel-store', () => ({
  readAgreedCancelTarget: async (_db: unknown, id: string) =>
    state.target && state.target.reservationId === id ? state.target : null,
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

/** 로컬 개발에서 요청 상태를 흉내 낸다 */
function fakeStatus(value: string) {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEV_FAKE_AGREED_CANCEL', value);
}

beforeEach(() => {
  state.owner = ok({ userId: 'owner-user', ownerId: 'owner-1', shopId: 'shop-1' });
  state.customer = ok({ userId: 'customer-user', customerId: 'customer-1' });
  state.now = NOW;
  state.target = { ...CONFIRMED };
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

  it('답을 기다리는 요청이 있으면 요청할 수 없고, 거절·만료 뒤에는 다시 요청할 수 있다', async () => {
    fakeStatus('requested');
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: {
        status: 'requested',
        canRequest: false,
        request: {
          requestId: RESERVATION,
          reason: 'style_mismatch',
          reasonText: null,
          requestedAt: new Date(NOW.getTime() - HOUR).toISOString(),
          expiresAt: new Date(NOW.getTime() + 23 * HOUR).toISOString(),
          respondedAt: null,
        },
      },
    });
    for (const status of ['declined', 'expired']) {
      fakeStatus(status);
      expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
        ok: true,
        data: { status, canRequest: true, request: { respondedAt: expect.any(String) } },
      });
    }
  });

  it('방문·노쇼 처리됐거나 취소된 예약은 요청할 수 없다', async () => {
    state.target = { ...CONFIRMED, status: 'completed', visitResult: 'visited' };
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: { canRequest: false },
    });
  });

  it('내 샵 예약이 아니거나 id 모양이 틀리면 RESERVATION_NOT_FOUND, 원장님이 아니면 그 실패', async () => {
    state.target = { ...CONFIRMED, shopId: 'shop-2' };
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    expect(await getAgreedCancelStatus('nope')).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    state.owner = fail('FORBIDDEN', '권한이 없어요');
    expect(await getAgreedCancelStatus(RESERVATION)).toEqual(fail('FORBIDDEN', '권한이 없어요'));
  });
});

describe('requestAgreedCancel (원장님)', () => {
  it('요청 id와 요청·만료 시각(24시간 뒤)을 돌려준다', async () => {
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'style_mismatch' }),
    ).toEqual(
      ok({
        requestId: RESERVATION,
        requestedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 24 * HOUR).toISOString(),
      }),
    );
  });

  it('사유가 없거나, 기타인데 내용이 없거나 100자를 넘으면 INVALID_INPUT(기타가 아니면 내용은 무시)', async () => {
    const codeOf = async (reason: string, reasonText?: string | null) => {
      const result = await requestAgreedCancel({ reservationId: RESERVATION, reason, reasonText });
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf('')).toBe('INVALID_INPUT');
    expect(await codeOf('other')).toBe('INVALID_INPUT');
    expect(await codeOf('other', '   ')).toBe('INVALID_INPUT');
    expect(await codeOf('other', '가'.repeat(101))).toBe('INVALID_INPUT');
    expect(await codeOf('other', '손님이 다음에 다시 오기로 했어요')).toBe('ok');
    expect(await codeOf('customer_declined', '가'.repeat(300))).toBe('ok');
  });

  it('예정 예약이 아니면 NOT_REQUESTABLE, 답을 기다리는 요청이 있으면 ALREADY_REQUESTED, 남의 샵 예약이면 RESERVATION_NOT_FOUND', async () => {
    state.target = { ...CONFIRMED, status: 'cancelled' };
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'style_mismatch' }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_REQUESTABLE' } });

    state.target = { ...CONFIRMED };
    fakeStatus('requested');
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'style_mismatch' }),
    ).toMatchObject({
      ok: false,
      error: {
        code: 'ALREADY_REQUESTED',
        message:
          '손님 답을 기다리는 요청이 있어요. 손님이 거절하거나 24시간이 지나면 다시 요청할 수 있어요',
      },
    });

    state.target = { ...CONFIRMED, shopId: 'shop-2' };
    expect(
      await requestAgreedCancel({ reservationId: RESERVATION, reason: 'style_mismatch' }),
    ).toMatchObject({ ok: false, error: { code: 'RESERVATION_NOT_FOUND' } });
  });
});

describe('getAgreedCancelRequest (고객)', () => {
  it('답을 기다리는 요청이 없으면 null', async () => {
    expect(await getAgreedCancelRequest(RESERVATION)).toEqual(ok(null));
    for (const status of ['agreed', 'declined', 'expired', 'closed']) {
      fakeStatus(status);
      expect(await getAgreedCancelRequest(RESERVATION)).toEqual(ok(null));
    }
  });

  it('답을 기다리면 요청 카드 값: 환불은 실제 결제액 × 50%, 쓴 쿠폰은 안내용', async () => {
    fakeStatus('requested');
    expect(await getAgreedCancelRequest(RESERVATION)).toEqual(
      ok({
        requestId: RESERVATION,
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

  it('예약이 이미 취소·방문 처리됐으면 null, 내 예약이 아니면 REQUEST_NOT_FOUND', async () => {
    fakeStatus('requested');
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
  it('동의하면 환불액과 취소 시각, 동의하지 않으면 거절 시각', async () => {
    fakeStatus('requested');
    expect(await respondAgreedCancel({ requestId: RESERVATION, agree: true })).toEqual(
      ok({
        agreed: true,
        reservationId: RESERVATION,
        refundAmount: 10_225,
        cancelledAt: NOW.toISOString(),
      }),
    );
    expect(await respondAgreedCancel({ requestId: RESERVATION, agree: false })).toEqual(
      ok({ agreed: false, reservationId: RESERVATION, declinedAt: NOW.toISOString() }),
    );
  });

  it('상태별 실패: 요청 없음 NOT_FOUND, 만료 EXPIRED, 이미 답함 ALREADY_RESPONDED, 예약이 바뀜 RESERVATION_CHANGED', async () => {
    const codeOf = async () => {
      const result = await respondAgreedCancel({ requestId: RESERVATION, agree: true });
      return result.ok ? 'ok' : result.error.code;
    };
    expect(await codeOf()).toBe('REQUEST_NOT_FOUND');
    fakeStatus('expired');
    expect(await codeOf()).toBe('REQUEST_EXPIRED');
    fakeStatus('agreed');
    expect(await codeOf()).toBe('ALREADY_RESPONDED');
    fakeStatus('declined');
    expect(await codeOf()).toBe('ALREADY_RESPONDED');
    fakeStatus('closed');
    expect(await codeOf()).toBe('RESERVATION_CHANGED');
    fakeStatus('requested');
    state.target = { ...CONFIRMED, status: 'completed', visitResult: 'no_show' };
    expect(await codeOf()).toBe('RESERVATION_CHANGED');
  });

  it('남의 예약이거나 입력 모양이 틀리면 REQUEST_NOT_FOUND', async () => {
    fakeStatus('requested');
    state.target = { ...CONFIRMED, customerId: 'customer-2' };
    expect(await respondAgreedCancel({ requestId: RESERVATION, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'REQUEST_NOT_FOUND' },
    });
    expect(
      await respondAgreedCancel({ requestId: 'nope', agree: 'yes' as unknown as boolean }),
    ).toMatchObject({ ok: false, error: { code: 'REQUEST_NOT_FOUND' } });
  });

  it('실패 흉내 스위치: 환불 실패 문구는 예약 취소와 같다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_AGREED_CANCEL_FAILURE', 'respondAgreedCancel:REFUND_FAILED');
    expect(await respondAgreedCancel({ requestId: RESERVATION, agree: true })).toEqual({
      ok: false,
      error: {
        code: 'REFUND_FAILED',
        message: '환불하지 못했어요. 예약은 그대로예요. 잠시 후 다시 시도해 주세요',
      },
    });
  });
});

describe('스위치는 로컬 개발에서만', () => {
  it('배포·테스트에서는 상태 스위치가 있어도 요청한 적 없음으로 본다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_FAKE_AGREED_CANCEL', 'requested');
    vi.stubEnv('DEV_FAKE_AGREED_CANCEL_FAILURE', 'respondAgreedCancel:REFUND_FAILED');
    expect(await getAgreedCancelStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: { status: 'none' },
    });
    expect(await respondAgreedCancel({ requestId: RESERVATION, agree: true })).toMatchObject({
      ok: false,
      error: { code: 'REQUEST_NOT_FOUND' },
    });
  });
});
