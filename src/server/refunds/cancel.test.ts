// 환불 미리보기·예약 취소 (연결 #9, #128). 미리보기 숫자(calcRefund, 진짜)와 취소의 실패 코드·가짜 성공, 실패 흉내 스위치를 본다.
// 로그인·DB 읽기·시각은 가짜로 바꿔서 DB 없이 돈다. 내 예약만 읽는지는 refund-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { RefundTarget } from './refund-store';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const START = new Date('2026-11-01T06:00:00.000Z'); // 한국 시간 11/1 15:00
const HOUR = 60 * 60 * 1000;
const before = (hours: number) => new Date(START.getTime() - hours * HOUR);

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  target: null as unknown,
  reads: [] as [string, string][],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireCustomer: async () => state.auth }));
vi.mock('./refund-store', () => ({
  readRefundTarget: async (reservationId: string, customerId: string) => {
    state.reads.push([reservationId, customerId]);
    return state.target;
  },
}));

const { cancelReservation, previewRefund } = await import('./cancel');

function target(extra: Partial<RefundTarget> = {}): RefundTarget {
  return {
    reservationId: RESERVATION,
    status: 'confirmed',
    paidAmount: 45_000,
    salePrice: 45_000,
    couponAmount: 0,
    startAt: START,
    ...extra,
  };
}

beforeEach(() => {
  state.auth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.now = before(30);
  state.target = target();
  state.reads = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('previewRefund', () => {
  it('30시간 전: 70% 환불(settlement-examples.md 3장), 내 예약으로 읽는다', async () => {
    expect(await previewRefund(RESERVATION)).toEqual(
      ok({
        reservationId: RESERVATION,
        refundable: true,
        band: 'over_24h',
        penaltyRate: 30,
        paidAmount: 45_000,
        refundAmount: 31_500,
        penaltyAmount: 13_500,
        couponAmount: 0,
        startAt: START.toISOString(),
        serverNow: before(30).toISOString(),
      }),
    );
    expect(state.reads).toEqual([[RESERVATION, 'customer-1']]);
  });

  it('쿠폰을 쓴 결제는 실제 결제액 기준으로 환불하고 쓴 쿠폰을 알려준다', async () => {
    state.target = target({ paidAmount: 42_000, couponAmount: 3_000 });
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({
      paidAmount: 42_000,
      refundAmount: 29_400,
      penaltyAmount: 12_600,
      couponAmount: 3_000,
    });
  });

  it('6~24시간 전이면 50%', async () => {
    state.now = before(10);
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({
      refundable: true,
      band: '6h_to_24h',
      refundAmount: 22_500,
    });
  });

  it.each([
    ['6시간 미만', before(2)],
    ['시작 뒤', before(-1)],
  ])('%s이면 취소할 수 없다(refundable: false, 환불 0)', async (_, now) => {
    state.now = now;
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({
      refundable: false,
      band: 'under_6h',
      refundAmount: 0,
    });
  });

  it('이용 완료한 예약도 시작 뒤라 취소할 수 없다', async () => {
    state.target = target({ status: 'completed' });
    state.now = before(-2);
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data.refundable).toBe(false);
  });

  it('쿠폰으로 결제액이 0원이어도 시간 안이면 취소할 수 있다(돌려줄 돈만 0)', async () => {
    state.target = target({ salePrice: 3_000, paidAmount: 0, couponAmount: 3_000 });
    const result = await previewRefund(RESERVATION);
    expect(result.ok && result.data).toMatchObject({ refundable: true, refundAmount: 0 });
  });

  it('없거나 남의 예약이면 RESERVATION_NOT_FOUND, 취소된 예약이면 ALREADY_CANCELLED', async () => {
    state.target = null;
    const missing = await previewRefund(RESERVATION);
    expect(missing.ok === false && missing.error.code).toBe('RESERVATION_NOT_FOUND');

    state.target = target({ status: 'cancelled' });
    const cancelled = await previewRefund(RESERVATION);
    expect(cancelled.ok === false && cancelled.error.code).toBe('ALREADY_CANCELLED');
  });

  it('예약 id 모양이 아니면 DB를 보지 않고 RESERVATION_NOT_FOUND', async () => {
    const result = await previewRefund('not-a-uuid');
    expect(result.ok === false && result.error.code).toBe('RESERVATION_NOT_FOUND');
    expect(state.reads).toEqual([]);
  });

  it('로그인·고객 모드 실패는 그대로 돌려준다', async () => {
    state.auth = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    expect(await previewRefund(RESERVATION)).toEqual(state.auth);
  });
});

describe('cancelReservation (가짜 결과 버전)', () => {
  it('미리보기 금액 그대로면 취소 결과를 돌려준다', async () => {
    expect(
      await cancelReservation({ reservationId: RESERVATION, expectedRefundAmount: 31_500 }),
    ).toEqual(
      ok({
        reservationId: RESERVATION,
        refundAmount: 31_500,
        cancelledAt: before(30).toISOString(),
      }),
    );
    expect(state.reads).toEqual([[RESERVATION, 'customer-1']]);
  });

  it('6시간 미만·시작 뒤면 NOT_REFUNDABLE(서버도 막는다)', async () => {
    for (const now of [before(2), before(-1)]) {
      state.now = now;
      const result = await cancelReservation({
        reservationId: RESERVATION,
        expectedRefundAmount: 0,
      });
      expect(result.ok === false && result.error.code).toBe('NOT_REFUNDABLE');
    }
  });

  it('미리보기 뒤 구간이 바뀌었으면 REFUND_CHANGED와 새 미리보기', async () => {
    state.now = before(10); // 미리보기는 30시간 전(31,500원)에 봤는데 지금은 10시간 전
    const result = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(result.ok === false && result.error).toMatchObject({
      code: 'REFUND_CHANGED',
      preview: { band: '6h_to_24h', refundAmount: 22_500 },
    });
  });

  it('없거나 남의 예약, 이미 취소된 예약', async () => {
    state.target = null;
    const missing = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(missing.ok === false && missing.error.code).toBe('RESERVATION_NOT_FOUND');

    state.target = target({ status: 'cancelled' });
    const cancelled = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(cancelled.ok === false && cancelled.error.code).toBe('ALREADY_CANCELLED');
  });

  it.each([
    ['예약 id 모양', { reservationId: 'x', expectedRefundAmount: 0 }],
    ['음수 금액', { reservationId: RESERVATION, expectedRefundAmount: -1 }],
    ['소수 금액', { reservationId: RESERVATION, expectedRefundAmount: 10.5 }],
  ])('%s → INVALID_INPUT', async (_, input) => {
    const result = await cancelReservation(input);
    expect(result.ok === false && result.error.code).toBe('INVALID_INPUT');
    expect(state.reads).toEqual([]);
  });

  it('로그인·고객 모드 실패는 그대로 돌려준다', async () => {
    state.auth = fail('UNAUTHENTICATED', '로그인이 필요해요');
    expect(
      await cancelReservation({ reservationId: RESERVATION, expectedRefundAmount: 31_500 }),
    ).toEqual(state.auth);
  });
});

describe('실패 흉내 스위치 DEV_FAKE_PAYMENT_FAILURE=cancelReservation:<코드> (로컬 개발만)', () => {
  it('REFUND_FAILED를 흉내 낸다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'cancelReservation:REFUND_FAILED');
    const result = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(result.ok === false && result.error.code).toBe('REFUND_FAILED');
  });

  it('REFUND_CHANGED는 지금 미리보기를 같이 준다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'cancelReservation:REFUND_CHANGED');
    const result = await cancelReservation({
      reservationId: RESERVATION,
      expectedRefundAmount: 31_500,
    });
    expect(result.ok === false && result.error).toMatchObject({
      code: 'REFUND_CHANGED',
      preview: { refundAmount: 31_500 },
    });
  });

  it('다른 함수를 가리키거나 없는 코드, 로컬 개발이 아니면 평소대로', async () => {
    const input = { reservationId: RESERVATION, expectedRefundAmount: 31_500 };
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'holdSlot:HELD_BY_OTHER');
    expect((await cancelReservation(input)).ok).toBe(true);
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'cancelReservation:HELD_BY_OTHER');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await cancelReservation(input)).ok).toBe(true);
    expect(warn).toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'cancelReservation:REFUND_FAILED');
    expect((await cancelReservation(input)).ok).toBe(true);
  });
});
