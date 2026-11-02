// 포트원 결제 조회·취소 (W11 ②, W12). fetch를 가짜로 바꿔서 응답별로 어떻게 읽는지, 키를 어떻게 보내는지 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cancelPortOnePayment, getPortOnePayment } from './portone';

const fetchMock = vi.fn();

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('PORTONE_API_SECRET', 'secret-test');
  vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store-test');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getPortOnePayment', () => {
  it('결제 번호를 주소에 넣고(인코딩), API 시크릿을 Authorization 헤더로 보낸다', async () => {
    respond(200, { status: 'READY' });
    await getPortOnePayment('toori-a/b');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.portone.io/payments/toori-a%2Fb?storeId=store-test');
    expect(init.headers).toEqual({ Authorization: 'PortOne secret-test' });
  });

  it('결제 완료(PAID): 상태·금액·통화·결제 시각·결제 수단을 읽는다', async () => {
    respond(200, {
      status: 'PAID',
      id: 'toori-1',
      amount: { total: 23_450, taxFree: 0, vat: 2_132, paid: 23_450 },
      currency: 'KRW',
      paidAt: '2026-11-01T03:05:00.000Z',
      method: { type: 'PaymentMethodCard', card: {} },
      orderName: '샘플 헤어 커트',
    });
    expect(await getPortOnePayment('toori-1')).toEqual({
      ok: true,
      payment: {
        status: 'PAID',
        amountTotal: 23_450,
        currency: 'KRW',
        paidAt: new Date('2026-11-01T03:05:00.000Z'),
        method: 'PaymentMethodCard',
        failureReason: null,
        failureCode: null,
        cancellations: [],
      },
    });
  });

  it('취소된 결제: 끝난 취소 내역만 읽는다', async () => {
    respond(200, {
      status: 'CANCELLED',
      cancellations: [
        { status: 'FAILED', id: 'c-0', totalAmount: 23_450 },
        { status: 'SUCCEEDED', id: 'c-1', totalAmount: 23_450, reason: '자동 취소' },
      ],
    });
    expect(await getPortOnePayment('toori-1')).toMatchObject({
      ok: true,
      payment: { status: 'CANCELLED', cancellations: [{ id: 'c-1', amount: 23_450 }] },
    });
  });

  it('실패(FAILED): 결제사가 알려준 이유를 읽는다', async () => {
    respond(200, { status: 'FAILED', failure: { reason: '카드 한도 초과', pgCode: 'X' } });
    expect(await getPortOnePayment('toori-1')).toMatchObject({
      ok: true,
      payment: {
        status: 'FAILED',
        amountTotal: null,
        paidAt: null,
        failureReason: '카드 한도 초과',
        failureCode: 'X',
      },
    });
  });

  it('고객이 결제창을 닫으면 FAILED와 결제사 코드 PAY_PROCESS_CANCELED(11/1 실제 응답 모양)', async () => {
    respond(200, {
      status: 'FAILED',
      failure: {
        reason: '[PAY_PROCESS_CANCELED] 사용자가 결제를 취소하였습니다',
        pgCode: 'PAY_PROCESS_CANCELED',
        pgMessage: '사용자가 결제를 취소하였습니다',
      },
    });
    expect(await getPortOnePayment('toori-1')).toMatchObject({
      ok: true,
      payment: { status: 'FAILED', failureCode: 'PAY_PROCESS_CANCELED' },
    });
  });

  it('404면 not_found(결제창까지 가지 않음)', async () => {
    respond(404, { type: 'PAYMENT_NOT_FOUND', message: '결제건이 존재하지 않습니다.' });
    expect(await getPortOnePayment('toori-1')).toEqual({ ok: false, reason: 'not_found' });
  });

  it.each([
    ['인증 실패(401)', () => respond(401, { type: 'UNAUTHORIZED' })],
    ['서버 오류(500)', () => respond(500, {})],
    ['응답 모양이 다름', () => respond(200, { nope: true })],
    ['네트워크 오류', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
  ])('%s → unavailable', async (_, setup) => {
    setup();
    expect(await getPortOnePayment('toori-1')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('키가 없으면 묻지 않고 unavailable', async () => {
    vi.stubEnv('PORTONE_API_SECRET', '');
    expect(await getPortOnePayment('toori-1')).toEqual({ ok: false, reason: 'unavailable' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('로그에 API 시크릿을 남기지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    respond(401, { type: 'UNAUTHORIZED' });
    await getPortOnePayment('toori-1');
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-test');
  });
});

describe('cancelPortOnePayment', () => {
  it('결제 번호를 주소에 넣고(인코딩), 상점 아이디와 사유를 보낸다. 금액을 보내지 않아 전액 취소다', async () => {
    respond(200, { cancellation: { status: 'SUCCEEDED', id: 'c-1', totalAmount: 23_450 } });
    await cancelPortOnePayment('toori-a/b', '자동 취소');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.portone.io/payments/toori-a%2Fb/cancel');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Authorization: 'PortOne secret-test',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ storeId: 'store-test', reason: '자동 취소' });
  });

  it('취소 성공(SUCCEEDED): 취소 번호와 실제 돌려준 금액을 읽는다', async () => {
    respond(200, {
      cancellation: {
        status: 'SUCCEEDED',
        id: 'c-1',
        pgCancellationId: 'pg-1',
        totalAmount: 23_450,
        taxFreeAmount: 0,
        vatAmount: 2_132,
        reason: '자동 취소',
        requestedAt: '2026-11-01T03:05:00.000Z',
      },
    });
    expect(await cancelPortOnePayment('toori-1', '자동 취소')).toEqual({
      ok: true,
      cancellationId: 'c-1',
      amount: 23_450,
    });
  });

  it('결제사가 처리 중(REQUESTED)이면 끝난 것으로 보지 않는다', async () => {
    respond(200, { cancellation: { status: 'REQUESTED', id: 'c-1', totalAmount: 23_450 } });
    expect(await cancelPortOnePayment('toori-1', '자동 취소')).toEqual({
      ok: false,
      reason: 'pending',
    });
  });

  it('이미 취소된 결제면 포트원의 취소 내역을 읽어 끝난 것으로 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: 'PAYMENT_ALREADY_CANCELLED' }), { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'CANCELLED',
            cancellations: [{ status: 'SUCCEEDED', id: 'c-1', totalAmount: 23_450 }],
          }),
          { status: 200 },
        ),
      );
    expect(await cancelPortOnePayment('toori-1', '자동 취소')).toEqual({
      ok: true,
      cancellationId: 'c-1',
      amount: 23_450,
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.portone.io/payments/toori-1?storeId=store-test',
    );
  });

  it('이미 취소됐는데 취소 내역을 읽지 못하면 unavailable(다시 시도한다)', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: 'PAYMENT_ALREADY_CANCELLED' }), { status: 409 }),
      )
      .mockRejectedValueOnce(new TypeError('fetch failed'));
    expect(await cancelPortOnePayment('toori-1', '자동 취소')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('이미 취소됐는데 취소 내역에 금액이 없으면 금액을 모르는 것으로 돌려준다', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ type: 'PAYMENT_ALREADY_CANCELLED' }), { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'CANCELLED' }), { status: 200 }),
      );
    expect(await cancelPortOnePayment('toori-1', '자동 취소')).toEqual({
      ok: true,
      cancellationId: null,
      amount: null,
    });
  });

  it.each([
    [
      '결제사가 거절(FAILED)',
      () => respond(200, { cancellation: { status: 'FAILED', id: 'c-1' } }),
    ],
    ['결제사 오류(502)', () => respond(502, { type: 'PG_PROVIDER', message: '오류' })],
    ['결제 안 된 건(409)', () => respond(409, { type: 'PAYMENT_NOT_PAID' })],
    ['인증 실패(401)', () => respond(401, { type: 'UNAUTHORIZED' })],
    ['응답 모양이 다름', () => respond(200, { nope: true })],
    ['네트워크 오류', () => fetchMock.mockRejectedValue(new TypeError('fetch failed'))],
  ])('%s → unavailable', async (_, setup) => {
    setup();
    expect(await cancelPortOnePayment('toori-1', '자동 취소')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('키가 없으면 부르지 않고 unavailable', async () => {
    vi.stubEnv('PORTONE_API_SECRET', '');
    expect(await cancelPortOnePayment('toori-1', '자동 취소')).toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
