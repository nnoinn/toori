// 포트원 결제 조회 (W11 ②). fetch를 가짜로 바꿔서 응답별로 어떻게 읽는지, 키를 어떻게 보내는지 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPortOnePayment } from './portone';

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
      },
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
      },
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
