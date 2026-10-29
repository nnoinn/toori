// 정산 계좌번호 암호화 (S-107). 풀면 원래 번호가 나오는지, 같은 번호도 매번 다른 암호문인지, 고친 암호문은 거절하는지 본다.

import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptAccountNumber, encryptAccountNumber } from './account-crypto';

beforeEach(() => {
  vi.stubEnv('PAYOUT_ACCOUNT_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('계좌번호 암호화', () => {
  it('풀면 원래 번호가 나오고, 암호문에는 번호가 보이지 않는다', () => {
    const stored = encryptAccountNumber('110123456789');
    expect(stored).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/);
    expect(stored).not.toContain('110123456789');
    expect(decryptAccountNumber(stored)).toBe('110123456789');
  });

  it('같은 번호도 매번 다른 암호문이다', () => {
    expect(encryptAccountNumber('110123456789')).not.toBe(encryptAccountNumber('110123456789'));
  });

  it('암호문을 고치거나 다른 키로 풀면 에러를 낸다', () => {
    const stored = encryptAccountNumber('110123456789');
    const [version, iv, tag, body] = stored.split(':');
    const flipped = Buffer.from(body, 'base64');
    flipped[0] ^= 1;
    expect(() =>
      decryptAccountNumber([version, iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow();

    vi.stubEnv('PAYOUT_ACCOUNT_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    expect(() => decryptAccountNumber(stored)).toThrow();
  });

  it('모양이 틀린 값은 풀지 않는다', () => {
    expect(() => decryptAccountNumber('110123456789')).toThrow('암호문 모양');
  });

  it('키가 없거나 32바이트가 아니면 바로 알린다', () => {
    vi.stubEnv('PAYOUT_ACCOUNT_ENCRYPTION_KEY', '');
    expect(() => encryptAccountNumber('110123456789')).toThrow('PAYOUT_ACCOUNT_ENCRYPTION_KEY');
    vi.stubEnv('PAYOUT_ACCOUNT_ENCRYPTION_KEY', randomBytes(16).toString('base64'));
    expect(() => encryptAccountNumber('110123456789')).toThrow('32바이트');
  });
});
