// 포트원 웹훅 서명 확인 (X-204, W13). 포트원 공식 SDK의 verify와 같은 규칙으로 만든 서명을 받는지, 틀린 요청을 거절하는지 본다.

import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { verifyWebhook } from './webhook-signature';

const KEY = Buffer.from('test-webhook-secret-key');
const SECRET = `whsec_${KEY.toString('base64')}`;
const NOW = new Date('2026-11-03T12:00:00.000Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const BODY = JSON.stringify({ type: 'Transaction.Paid', data: { paymentId: 'toori-1' } });

function sign(id: string, timestamp: string, body: string, key = KEY) {
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

function headers(extra: { id?: string; timestamp?: number; signature?: string } = {}) {
  const id = extra.id ?? 'msg-1';
  const timestamp = String(extra.timestamp ?? NOW_SECONDS);
  return new Headers({
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': extra.signature ?? `v1,${sign(id, timestamp, BODY)}`,
  });
}

describe('verifyWebhook', () => {
  it('서명이 맞으면 웹훅 번호와 내용을 돌려준다', () => {
    expect(verifyWebhook(SECRET, BODY, headers(), NOW)).toEqual({
      webhookId: 'msg-1',
      payload: JSON.parse(BODY),
    });
  });

  it('whsec_가 없는 시크릿도 받는다', () => {
    expect(verifyWebhook(KEY.toString('base64'), BODY, headers(), NOW)).not.toBeNull();
  });

  it('서명이 여러 개면 하나만 맞아도 된다(시크릿을 바꾸는 중)', () => {
    const good = sign('msg-1', String(NOW_SECONDS), BODY);
    const signature = `v1,${sign('msg-1', String(NOW_SECONDS), BODY, Buffer.from('old'))} v1,${good}`;
    expect(verifyWebhook(SECRET, BODY, headers({ signature }), NOW)).not.toBeNull();
  });

  it('다른 시크릿, 바뀐 내용, 다른 번호면 null', () => {
    const otherSecret = `whsec_${Buffer.from('other').toString('base64')}`;
    expect(verifyWebhook(otherSecret, BODY, headers(), NOW)).toBeNull();
    expect(verifyWebhook(SECRET, `${BODY} `, headers(), NOW)).toBeNull();
    const signature = `v1,${sign('msg-1', String(NOW_SECONDS), BODY)}`;
    expect(verifyWebhook(SECRET, BODY, headers({ id: 'msg-2', signature }), NOW)).toBeNull();
  });

  it('서명 시각이 5분 넘게 벗어나면 null, 5분까지는 받는다', () => {
    for (const [timestamp, passes] of [
      [NOW_SECONDS - 300, true],
      [NOW_SECONDS + 300, true],
      [NOW_SECONDS - 301, false],
      [NOW_SECONDS + 301, false],
    ] as const) {
      const signature = `v1,${sign('msg-1', String(timestamp), BODY)}`;
      const result = verifyWebhook(SECRET, BODY, headers({ timestamp, signature }), NOW);
      expect(result !== null).toBe(passes);
    }
  });

  it('헤더가 빠졌거나 모양이 다르면 null', () => {
    for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const missing = headers();
      missing.delete(name);
      expect(verifyWebhook(SECRET, BODY, missing, NOW)).toBeNull();
    }
    const good = sign('msg-1', String(NOW_SECONDS), BODY);
    expect(verifyWebhook(SECRET, BODY, headers({ signature: good }), NOW)).toBeNull();
    expect(verifyWebhook(SECRET, BODY, headers({ signature: `v2,${good}` }), NOW)).toBeNull();
    expect(verifyWebhook(SECRET, BODY, headers({ signature: 'v1,' }), NOW)).toBeNull();
    const notTime = new Headers(headers());
    notTime.set('webhook-timestamp', 'soon');
    expect(verifyWebhook(SECRET, BODY, notTime, NOW)).toBeNull();
  });

  it('서명은 맞는데 내용이 JSON이 아니면 null', () => {
    const body = 'not json';
    const signature = `v1,${sign('msg-1', String(NOW_SECONDS), body)}`;
    expect(verifyWebhook(SECRET, body, headers({ signature }), NOW)).toBeNull();
  });
});
