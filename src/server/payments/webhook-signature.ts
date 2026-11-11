// 포트원 웹훅 서명 확인 (X-204, W13). 서버에서만 부른다.
// Standard Webhooks 방식이고, 포트원 공식 SDK(@portone/server-sdk)의 verify와 규칙이 같다. 패키지를 더하지 않으려고 직접 확인한다.

import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET_PREFIX = 'whsec_';
/** 서명 시각과 지금의 차이가 이보다 크면 거절한다(가로챈 요청을 나중에 다시 보내는 것을 막는다). SDK와 같은 5분 */
const TOLERANCE_SECONDS = 5 * 60;

export type VerifiedWebhook = { webhookId: string; payload: unknown };

/** 서명이 맞으면 웹훅 번호와 내용을 돌려준다. 틀리거나 시각이 벗어나거나 내용을 읽지 못하면 null */
export function verifyWebhook(
  secret: string,
  body: string,
  headers: Headers,
  now: Date,
): VerifiedWebhook | null {
  const webhookId = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!webhookId || !timestamp || !signatures) return null;

  const seconds = Number.parseInt(timestamp, 10);
  if (Number.isNaN(seconds) || Math.abs(now.getTime() / 1000 - seconds) > TOLERANCE_SECONDS) {
    return null;
  }

  const key = Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    'base64',
  );
  const expected = createHmac('sha256', key).update(`${webhookId}.${timestamp}.${body}`).digest();
  // 시크릿을 바꾸는 동안에는 서명이 여러 개 온다. 공백으로 나뉘고 하나만 맞으면 된다
  const matched = signatures.split(' ').some((versioned) => {
    const [version, signature] = versioned.split(',', 2);
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matched) return null;

  try {
    return { webhookId, payload: JSON.parse(body) as unknown };
  } catch {
    return null;
  }
}
