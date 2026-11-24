// 같은 사람 표시 (#154 본문 4장, 0023 profiles.identity_hash). 서버에서만 부른다.
// 로그인 이메일(앞뒤 공백 빼고 소문자)의 HMAC-SHA256을 16진수로 남긴다. 되돌릴 수 없고, 키 없이는 같은 값을 만들 수 없다.
// 키는 서버 환경변수 ACCOUNT_IDENTITY_KEY(32바이트를 16진수 64자리로, 11/23 nnoinn이 만들어 단톡방·Vercel에 둠).
// 키를 바꾸면 예전 값과 이어지지 않으니 바꾸지 않는다. 로그에 이메일이나 값을 남기지 않는다.
//
// 키가 없을 때(11/24 강규민 결정): 운영 배포(VERCEL_ENV=production)는 탈퇴를 막고, 로컬·미리보기는 같은 사람 표시 없이 진행하고 경고를 남긴다.
// 테스트는 vitest 설정의 가짜 키를 쓴다

import 'server-only';

import { createHmac } from 'node:crypto';

const KEY_PATTERN = /^[0-9a-f]{64}$/i;

/** 키. 없거나 모양이 틀리면 null(틀리면 경고만 남기고 값은 로그에 남기지 않는다) */
function identityKey(): Buffer | null {
  const raw = process.env.ACCOUNT_IDENTITY_KEY;
  if (!raw) return null;
  if (!KEY_PATTERN.test(raw)) {
    console.error('[identity] ACCOUNT_IDENTITY_KEY가 16진수 64자리(32바이트)가 아니에요');
    return null;
  }
  return Buffer.from(raw, 'hex');
}

/** 같은 사람 표시 값. 이메일이 비었거나 키가 없으면 null */
export function identityHashOf(email: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const key = identityKey();
  if (!key) return null;
  return createHmac('sha256', key).update(normalized, 'utf8').digest('hex');
}

/** 같은 사람 표시를 만들 수 없을 때 탈퇴를 막아야 하는지. 운영 배포만 막는다 */
export function identityHashRequired(): boolean {
  return process.env.VERCEL_ENV === 'production';
}
