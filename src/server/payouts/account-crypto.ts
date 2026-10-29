// 정산 계좌번호 암호화 (S-107, X-206, #47 4장). 서버에서만 부른다.
// AES-256-GCM, 키는 서버 환경변수 PAYOUT_ACCOUNT_ENCRYPTION_KEY(32바이트를 base64로). 키를 바꾸면 이미 암호화한 계좌를 못 읽는다.
// 저장 모양: v1:<iv>:<인증 태그>:<암호문> (모두 base64). 전체 계좌번호는 운영자 화면·PG 셀러 등록에서만 푼다. 로그에 남기지 않는다.

import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const raw = process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  const key = raw ? Buffer.from(raw, 'base64') : undefined;
  if (!key || key.length !== 32) {
    throw new Error(
      'PAYOUT_ACCOUNT_ENCRYPTION_KEY가 없거나 32바이트(base64)가 아니에요. .env.local을 확인해 주세요.',
    );
  }
  return key;
}

export function encryptAccountNumber(accountNumber: string): string {
  // GCM은 같은 키로 iv를 다시 쓰면 안전하지 않아서 매번 새로 만든다
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(accountNumber, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), encrypted]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join(':');
}

/** 암호문을 푼다. 모양이 틀리거나 누가 고쳤으면(인증 태그 불일치) 에러를 낸다 */
export function decryptAccountNumber(stored: string): string {
  const [version, iv, tag, encrypted] = stored.split(':');
  if (version !== VERSION || !iv || !tag || encrypted === undefined) {
    throw new Error('정산 계좌번호 암호문 모양이 아니에요');
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
