// 포트원 웹훅 주소 (X-204, W13). 서명이 맞을 때만 처리를 부르는지, 결과별 응답 코드를 본다. 처리 자체는 webhook.test.ts가 본다.

import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = new Date('2026-11-03T12:00:00.000Z');
const KEY = Buffer.from('route-test-secret');
const SECRET = `whsec_${KEY.toString('base64')}`;
const BODY = JSON.stringify({ type: 'Transaction.Paid', data: { paymentId: 'toori-1' } });

const state = vi.hoisted(() => ({ handle: vi.fn() }));

vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/payments', async () => ({
  handlePortOneWebhook: state.handle,
  verifyWebhook: (await import('@/server/payments/webhook-signature')).verifyWebhook,
}));

const { POST } = await import('./route');

function request(body = BODY, signedBody = BODY) {
  const timestamp = String(NOW.getTime() / 1000);
  const signature = createHmac('sha256', KEY)
    .update(`msg-1.${timestamp}.${signedBody}`)
    .digest('base64');
  return new Request('http://localhost/api/webhooks/portone', {
    method: 'POST',
    headers: {
      'webhook-id': 'msg-1',
      'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${signature}`,
    },
    body,
  });
}

beforeEach(() => {
  state.handle.mockReset();
  state.handle.mockResolvedValue('done');
  vi.stubEnv('PORTONE_WEBHOOK_SECRET', SECRET);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/webhooks/portone', () => {
  it('서명이 맞으면 서버 시각으로 처리하고 200', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(state.handle).toHaveBeenCalledWith(
      'db',
      { webhookId: 'msg-1', payload: JSON.parse(BODY) },
      NOW,
    );
  });

  it('서명이 틀리면 처리하지 않고 400', async () => {
    const response = await POST(request(`${BODY} `));
    expect(response.status).toBe(400);
    expect(state.handle).not.toHaveBeenCalled();
  });

  it('시크릿이 없으면 처리하지 않고 500(설정하면 포트원이 다시 보낸다)', async () => {
    vi.stubEnv('PORTONE_WEBHOOK_SECRET', '');
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(state.handle).not.toHaveBeenCalled();
  });

  it('다시 봐야 하면 503으로 포트원이 다시 보내게 한다', async () => {
    state.handle.mockResolvedValue('retry');
    expect((await POST(request())).status).toBe(503);
  });

  it('처리 중 오류면 500이고 로그에 내용을 남기지 않는다', async () => {
    state.handle.mockRejectedValue(new Error('toori-1 저장 실패'));
    expect((await POST(request())).status).toBe(500);
    expect(console.error).toHaveBeenCalledWith('[webhook] 처리 실패:', 'Error');
  });
});
