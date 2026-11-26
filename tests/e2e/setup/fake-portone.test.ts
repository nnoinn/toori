// 가짜 포트원 서버(E2E #592 2차)의 규칙. 가짜가 틀리면 E2E가 진짜와 다른 것을 확인하게 되므로,
// ① 규칙(조회·취소·잔액 확인)을 직접 보고 ② 앱의 진짜 포트원 코드(src/server/payments/portone.ts)가 가짜의 답을 제대로 읽는지 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelPortOnePayment, getPortOnePayment } from '@/server/payments/portone';

import {
  CLOSED_WINDOW_CODE,
  createFakePortOneState,
  FAKE_PORTONE,
  handleFakePortOne,
} from './fake-portone.mjs';

const AUTH = { authorization: `PortOne ${FAKE_PORTONE.secret}` };
const QUERY = `?storeId=${FAKE_PORTONE.storeId}`;

/** 테스트가 결제창 결과를 넣는다(support/portone.ts가 부르는 칸) */
function putWindow(
  state: ReturnType<typeof createFakePortOneState>,
  paymentId: string,
  body: unknown,
) {
  return handleFakePortOne(state, {
    method: 'PUT',
    url: `/__e2e/payments/${paymentId}`,
    headers: {},
    body,
  });
}

function lookup(
  state: ReturnType<typeof createFakePortOneState>,
  paymentId: string,
  headers = AUTH,
) {
  return handleFakePortOne(state, {
    method: 'GET',
    url: `/payments/${paymentId}${QUERY}`,
    headers,
    body: null,
  });
}

function cancel(
  state: ReturnType<typeof createFakePortOneState>,
  paymentId: string,
  body: Record<string, unknown>,
) {
  return handleFakePortOne(state, {
    method: 'POST',
    url: `/payments/${paymentId}/cancel`,
    headers: AUTH,
    body: { storeId: FAKE_PORTONE.storeId, reason: '고객 예약 취소', ...body },
  });
}

describe('가짜 포트원: 조회', () => {
  it('결제창에서 결제하면 PAID와 금액·통화(KRW)·결제 수단을 답한다', () => {
    const state = createFakePortOneState();
    expect(putWindow(state, 'toori-1', { outcome: 'paid', amount: 23_450 }).status).toBe(200);
    const { status, body } = lookup(state, 'toori-1');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: 'PAID',
      amount: { total: 23_450 },
      currency: 'KRW',
      method: { type: 'PaymentMethodCard' },
      cancellations: [],
    });
  });

  it('결제창을 닫으면 진짜 포트원처럼 FAILED와 결제사 코드 PAY_PROCESS_CANCELED를 답한다', () => {
    const state = createFakePortOneState();
    putWindow(state, 'toori-1', { outcome: 'closed', amount: 23_450 });
    expect(lookup(state, 'toori-1').body).toMatchObject({
      status: 'FAILED',
      failure: { pgCode: CLOSED_WINDOW_CODE },
    });
  });

  it('없는 결제는 404, 시크릿이나 상점 아이디가 E2E 가짜 값이 아니면 401', () => {
    const state = createFakePortOneState();
    putWindow(state, 'toori-1', { outcome: 'paid', amount: 10_000 });
    expect(lookup(state, 'toori-x').status).toBe(404);
    expect(lookup(state, 'toori-1', { authorization: 'PortOne real-secret' }).status).toBe(401);
    expect(
      handleFakePortOne(state, {
        method: 'GET',
        url: '/payments/toori-1?storeId=store-real',
        headers: AUTH,
        body: null,
      }).status,
    ).toBe(401);
  });

  it('결제창 결과는 결제(paid)·닫음(closed)과 숫자 금액만 받는다', () => {
    const state = createFakePortOneState();
    expect(putWindow(state, 'toori-1', { outcome: 'refund', amount: 1 }).status).toBe(400);
    expect(putWindow(state, 'toori-1', { outcome: 'paid', amount: '1000' }).status).toBe(400);
    expect(lookup(state, 'toori-1').status).toBe(404);
  });
});

describe('가짜 포트원: 취소', () => {
  it('부분 취소는 앱이 아는 잔액이 맞을 때만 받고, 잔액이 달라지면 거절한다(두 번 환불되지 않게)', () => {
    const state = createFakePortOneState();
    putWindow(state, 'toori-1', { outcome: 'paid', amount: 23_000 });

    const first = cancel(state, 'toori-1', { amount: 16_100, currentCancellableAmount: 23_000 });
    expect(first).toEqual({
      status: 200,
      body: {
        cancellation: expect.objectContaining({
          status: 'SUCCEEDED',
          totalAmount: 16_100,
          reason: '고객 예약 취소',
        }),
      },
    });
    expect(lookup(state, 'toori-1').body).toMatchObject({ status: 'PARTIAL_CANCELLED' });

    // 같은 요청을 다시 보내면(앞선 요청이 이미 돌려줌) 잔액이 6,900원이라 거절
    const again = cancel(state, 'toori-1', { amount: 16_100, currentCancellableAmount: 23_000 });
    expect(again).toEqual({
      status: 409,
      body: expect.objectContaining({ type: 'CANCELLABLE_AMOUNT_CONSISTENCY_BROKEN' }),
    });
    expect(
      (lookup(state, 'toori-1').body as { cancellations: unknown[] }).cancellations,
    ).toHaveLength(1);
  });

  it('금액 없이 보내면 남은 금액을 모두 취소하고, 다시 보내면 이미 취소됐다고 답한다', () => {
    const state = createFakePortOneState();
    putWindow(state, 'toori-1', { outcome: 'paid', amount: 23_000 });
    cancel(state, 'toori-1', { amount: 16_100, currentCancellableAmount: 23_000 });

    const rest = cancel(state, 'toori-1', {});
    expect(rest.body).toMatchObject({ cancellation: { totalAmount: 6_900 } });
    expect(lookup(state, 'toori-1').body).toMatchObject({ status: 'CANCELLED' });
    expect(cancel(state, 'toori-1', {}).body).toMatchObject({ type: 'PAYMENT_ALREADY_CANCELLED' });
  });

  it('잔액보다 많이 돌려 달라거나, 결제되지 않은 결제는 거절한다', () => {
    const state = createFakePortOneState();
    putWindow(state, 'toori-1', { outcome: 'paid', amount: 10_000 });
    expect(
      cancel(state, 'toori-1', { amount: 10_010, currentCancellableAmount: 10_000 }).status,
    ).toBe(400);
    putWindow(state, 'toori-2', { outcome: 'closed', amount: 10_000 });
    expect(cancel(state, 'toori-2', {}).body).toMatchObject({ type: 'PAYMENT_NOT_PAID' });
    expect(cancel(state, 'toori-x', {}).status).toBe(404);
  });
});

describe('앱의 포트원 코드가 가짜 포트원의 답을 읽는다', () => {
  let state: ReturnType<typeof createFakePortOneState>;
  const urls: string[] = [];

  beforeEach(() => {
    state = createFakePortOneState();
    urls.length = 0;
    // 앱 서버가 E2E에서 받는 값(local-supabase.mjs e2eAppEnv)
    vi.stubEnv('PORTONE_API_URL', FAKE_PORTONE.url);
    vi.stubEnv('PORTONE_API_SECRET', FAKE_PORTONE.secret);
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', FAKE_PORTONE.storeId);
    vi.stubEnv('VERCEL_ENV', '');
    // 네트워크 대신 가짜 포트원 처리 함수로 보낸다
    vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
      urls.push(String(input));
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const { status, body } = handleFakePortOne(state, {
        method: init?.method ?? 'GET',
        url: String(input),
        headers: { authorization: headers.Authorization },
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });
      return new Response(JSON.stringify(body), { status });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('결제 조회: 가짜 포트원 주소로 묻고, 결제 완료와 금액을 읽는다', async () => {
    putWindow(state, 'toori-1', { outcome: 'paid', amount: 23_450 });
    const result = await getPortOnePayment('toori-1');
    expect(urls[0]).toBe(`${FAKE_PORTONE.url}/payments/toori-1${QUERY}`);
    expect(result).toMatchObject({
      ok: true,
      payment: { status: 'PAID', amountTotal: 23_450, currency: 'KRW' },
    });
  });

  it('결제창을 닫은 결제: 결제사 코드를 읽는다(앱은 이 코드면 결제 취소로 본다)', async () => {
    putWindow(state, 'toori-1', { outcome: 'closed', amount: 23_450 });
    expect(await getPortOnePayment('toori-1')).toMatchObject({
      ok: true,
      payment: { status: 'FAILED', failureCode: CLOSED_WINDOW_CODE },
    });
    expect(await getPortOnePayment('toori-x')).toEqual({ ok: false, reason: 'not_found' });
  });

  it('부분 취소: 돌려준 금액을 읽고, 같은 취소를 다시 보내면 앞선 취소 내역을 돌려준다', async () => {
    putWindow(state, 'toori-1', { outcome: 'paid', amount: 23_000 });
    const partial = { amount: 16_100, currentCancellableAmount: 23_000 };
    const first = await cancelPortOnePayment('toori-1', '고객 예약 취소', partial);
    expect(first).toMatchObject({ ok: true, amount: 16_100 });
    // 잔액이 달라져 거절되면 앱은 포트원의 끝난 취소 내역을 읽어 같은 결과로 본다(두 번 돌려주지 않는다)
    const again = await cancelPortOnePayment('toori-1', '고객 예약 취소', partial);
    expect(again).toEqual(first);
  });
});
