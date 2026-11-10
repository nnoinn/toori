// 정산 계좌 바꾸기 (#295). 같은 계좌인지 판단, 변경 기록에 남기는 값, 알림을 부르는 때를 본다. DB 저장과 알림은 가짜로 바꾼다.
// 실제 DB 저장은 change-account-store.db.test.ts가 본다.

import { randomBytes } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { CurrentPayoutAccount } from './change-account-store';

const state = vi.hoisted(() => ({
  current: null as CurrentPayoutAccount | null,
  written: [] as { shopId: string; values: Record<string, string> }[],
  changes: [] as unknown[],
  alerts: [] as unknown[],
}));

vi.mock('./change-account-store', () => ({
  lockPayoutAccount: async () => state.current,
  writePayoutAccount: async (_tx: unknown, shopId: string, values: Record<string, string>) => {
    state.written.push({ shopId, values });
  },
  insertPayoutAccountChange: async (_tx: unknown, row: unknown) => {
    state.changes.push(row);
    return 'change-1';
  },
}));
vi.mock('@/server/notifications/alerts', () => ({
  notifyPayoutAccountChanged: (_db: unknown, input: unknown) => {
    state.alerts.push(input);
  },
}));

const { decryptAccountNumber, encryptAccountNumber } = await import('./account-crypto');
const { changePayoutAccount } = await import('./change-account');

const db = {
  transaction: async (run: (tx: unknown) => unknown) => run('tx'),
} as unknown as ReturnType<typeof getDb>;

const INPUT = {
  shopId: 'shop-1',
  changedBy: 'owner-user',
  bankCode: '088',
  accountNumber: '110123456789',
  accountHolder: '테스트 원장',
} as const;

beforeEach(() => {
  vi.stubEnv('PAYOUT_ACCOUNT_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  state.current = null;
  state.written = [];
  state.changes = [];
  state.alerts = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function currentAccount(bankCode: string, accountNumber: string): CurrentPayoutAccount {
  return {
    bankCode,
    accountNumberEncrypted: encryptAccountNumber(accountNumber),
    accountLast4: accountNumber.slice(-4),
  };
}

describe('changePayoutAccount', () => {
  it('계좌 없이 만든 원장님이 처음 등록하면 바꾸기 전은 비우고 기록·알림을 남긴다(#213)', async () => {
    expect(await changePayoutAccount(db, INPUT)).toEqual({ changed: true });
    expect(state.changes).toEqual([
      {
        shopId: 'shop-1',
        changedBy: 'owner-user',
        previousBankCode: null,
        previousAccountLast4: null,
        bankCode: '088',
        accountLast4: '6789',
      },
    ]);
    expect(state.alerts).toEqual([{ shopId: 'shop-1', changeId: 'change-1' }]);
  });

  it('저장하는 계좌번호는 암호문이고, 풀면 넣은 번호다. 뒷자리와 예금주는 그대로 저장한다', async () => {
    await changePayoutAccount(db, INPUT);
    const [{ shopId, values }] = state.written;
    expect(shopId).toBe('shop-1');
    expect(values).toMatchObject({
      bankCode: '088',
      accountLast4: '6789',
      accountHolder: '테스트 원장',
    });
    expect(values.accountNumberEncrypted).not.toContain(INPUT.accountNumber);
    expect(decryptAccountNumber(values.accountNumberEncrypted)).toBe(INPUT.accountNumber);
  });

  it('계좌번호가 바뀌면 바꾸기 전·뒤 은행과 뒷자리를 남기고 알린다', async () => {
    state.current = currentAccount('088', '110987654321');
    expect(await changePayoutAccount(db, INPUT)).toEqual({ changed: true });
    expect(state.changes).toEqual([
      expect.objectContaining({
        previousBankCode: '088',
        previousAccountLast4: '4321',
        bankCode: '088',
        accountLast4: '6789',
      }),
    ]);
    expect(state.alerts).toHaveLength(1);
  });

  it('번호가 같아도 은행이 바뀌면 바뀐 계좌다', async () => {
    state.current = currentAccount('004', INPUT.accountNumber);
    expect(await changePayoutAccount(db, INPUT)).toEqual({ changed: true });
    expect(state.changes).toEqual([
      expect.objectContaining({ previousBankCode: '004', bankCode: '088' }),
    ]);
  });

  it('은행·번호가 같으면(예금주만 고친 경우 포함) 저장만 하고 기록·알림은 없다', async () => {
    state.current = currentAccount('088', INPUT.accountNumber);
    expect(await changePayoutAccount(db, { ...INPUT, accountHolder: '새 예금주' })).toEqual({
      changed: false,
    });
    expect(state.written).toHaveLength(1);
    expect(state.written[0].values.accountHolder).toBe('새 예금주');
    expect(state.changes).toEqual([]);
    expect(state.alerts).toEqual([]);
  });

  it('지금 암호문을 풀지 못하면 바뀐 것으로 보고 기록·알림을 남기며, 로그에 계좌번호를 넣지 않는다', async () => {
    state.current = { bankCode: '088', accountNumberEncrypted: 'v1:bad', accountLast4: '6789' };
    expect(await changePayoutAccount(db, INPUT)).toEqual({ changed: true });
    expect(state.changes).toHaveLength(1);
    expect(state.alerts).toHaveLength(1);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain(INPUT.accountNumber);
  });
});
