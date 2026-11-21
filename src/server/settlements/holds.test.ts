// 운영자 정산 보류·풀기 (#373 ②). 권한·입력·사유, 저장 함수에 넘기는 값(운영자·다듬은 사유·시각), unique 위반을 ALREADY_HELD로 바꾸는지 본다.
// 로그인·DB·시각과 저장(hold-store.ts, hold-store.db.test.ts가 본다)은 가짜로 바꿔서 DB 없이 돈다.

import { DrizzleQueryError } from 'drizzle-orm/errors';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const SHOP = '6e7f8091-ab2c-4d3e-9f40-516273849506';
const HOLD = '7f8091a2-bc3d-4e4f-8051-627384950617';
const NOW = new Date('2026-11-16T08:00:00.000Z');
/** 원장님에게 보여 줄 사유 코드(정산 보류 목록, #489) */
const CODE = 'payout_info_check';

const state = vi.hoisted(() => ({
  auth: null as unknown,
  calls: [] as unknown[],
  result: null as unknown,
  throws: null as unknown,
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({
    transaction: async (run: (tx: string) => unknown) => {
      if (state.throws) throw state.throws;
      return run('tx');
    },
  }),
}));
vi.mock('./hold-store', () => ({
  holdReservationInTx: async (tx: unknown, input: unknown) => {
    state.calls.push(['reservation', tx, input]);
    return state.result;
  },
  holdShopInTx: async (tx: unknown, input: unknown) => {
    state.calls.push(['shop', tx, input]);
    return state.result;
  },
  releaseHoldInTx: async (tx: unknown, input: unknown) => {
    state.calls.push(['release', tx, input]);
    return state.result;
  },
}));

const { holdReservationSettlement, holdShopSettlement, releaseSettlementHold } =
  await import('./holds');

/** postgres-js가 던지는 unique 위반을 Drizzle이 감싼 모양 */
function uniqueViolation(constraint: string) {
  return new DrizzleQueryError(
    'insert',
    [],
    Object.assign(new Error('duplicate key'), {
      constraint_name: constraint,
    }),
  );
}

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.calls = [];
  state.result = ok({ holdId: HOLD, heldAt: NOW.toISOString() });
  state.throws = null;
});

describe('holdReservationSettlement', () => {
  it('운영자·다듬은 사유·요청 시각으로 한 트랜잭션에서 저장하고 그 결과를 돌려준다', async () => {
    expect(
      await holdReservationSettlement({
        reservationId: RESERVATION,
        reason: '  계좌 확인 필요 ',
        code: CODE,
      }),
    ).toEqual(state.result);
    expect(state.calls).toEqual([
      [
        'reservation',
        'tx',
        {
          reservationId: RESERVATION,
          adminId: 'admin-1',
          reason: '계좌 확인 필요',
          code: CODE,
          now: NOW,
        },
      ],
    ]);
  });

  it('운영자가 아니면 그 실패, 모양이 틀린 id는 RESERVATION_NOT_FOUND, 사유가 비거나 길면 그 실패이고 저장하지 않는다', async () => {
    state.auth = fail('FORBIDDEN', '운영자만 할 수 있어요');
    expect(
      await holdReservationSettlement({ reservationId: RESERVATION, reason: '확인', code: CODE }),
    ).toMatchObject({ error: { code: 'FORBIDDEN' } });
    state.auth = ok({ userId: 'admin-1' });
    expect(
      await holdReservationSettlement({ reservationId: 'x', reason: '확인', code: CODE }),
    ).toMatchObject({
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    expect(
      await holdReservationSettlement({ reservationId: RESERVATION, reason: '   ', code: CODE }),
    ).toMatchObject({ error: { code: 'REASON_REQUIRED' } });
    expect(
      await holdReservationSettlement({
        reservationId: RESERVATION,
        reason: '가'.repeat(ADMIN_REASON_LIMIT + 1),
        code: CODE,
      }),
    ).toMatchObject({ error: { code: 'REASON_TOO_LONG' } });
    expect(state.calls).toEqual([]);
  });

  it('원장님에게 보여 줄 사유 코드(#489)가 없거나 정산 보류 목록에 없는 코드면 CODE_REQUIRED이고 저장하지 않는다', async () => {
    for (const code of ['', 'listing_mismatch', 'shop_info_check', 'nope', undefined]) {
      expect(
        await holdReservationSettlement({
          reservationId: RESERVATION,
          reason: '확인',
          code: code as string,
        }),
      ).toMatchObject({ error: { code: 'CODE_REQUIRED' } });
      expect(
        await holdShopSettlement({ shopId: SHOP, reason: '확인', code: code as string }),
      ).toMatchObject({ error: { code: 'CODE_REQUIRED' } });
    }
    expect(state.calls).toEqual([]);
  });

  it('동시에 걸어 unique 인덱스에 막히면 ALREADY_HELD, 다른 오류는 그대로 던진다', async () => {
    state.throws = uniqueViolation('settlement_holds_reservation_active_unique');
    expect(
      await holdReservationSettlement({ reservationId: RESERVATION, reason: '확인', code: CODE }),
    ).toMatchObject({ error: { code: 'ALREADY_HELD' } });
    state.throws = uniqueViolation('settlement_holds_shop_active_unique');
    expect(await holdShopSettlement({ shopId: SHOP, reason: '확인', code: CODE })).toMatchObject({
      error: { code: 'ALREADY_HELD' },
    });
    state.throws = new Error('connection lost');
    await expect(
      holdReservationSettlement({ reservationId: RESERVATION, reason: '확인', code: CODE }),
    ).rejects.toThrow('connection lost');
  });
});

describe('holdShopSettlement', () => {
  it('샵 전체 보류를 운영자·사유·시각으로 저장하고, 모양이 틀린 샵 id는 SHOP_NOT_FOUND', async () => {
    await holdShopSettlement({ shopId: SHOP, reason: '사업자 정보 확인', code: CODE });
    expect(state.calls).toEqual([
      [
        'shop',
        'tx',
        { shopId: SHOP, adminId: 'admin-1', reason: '사업자 정보 확인', code: CODE, now: NOW },
      ],
    ]);
    expect(await holdShopSettlement({ shopId: 'x', reason: '확인', code: CODE })).toMatchObject({
      error: { code: 'SHOP_NOT_FOUND' },
    });
    expect(state.calls).toHaveLength(1);
  });
});

describe('releaseSettlementHold', () => {
  it('메모를 다듬어 운영자·시각과 함께 풀고, 메모가 비거나 id 모양이 틀리면 풀지 않는다', async () => {
    state.result = ok({ holdId: HOLD, releasedAt: NOW.toISOString() });
    expect(await releaseSettlementHold({ holdId: HOLD, memo: ' 계좌 확인함 ' })).toEqual(
      state.result,
    );
    expect(state.calls).toEqual([
      ['release', 'tx', { holdId: HOLD, adminId: 'admin-1', memo: '계좌 확인함', now: NOW }],
    ]);
    expect(await releaseSettlementHold({ holdId: HOLD, memo: '' })).toMatchObject({
      error: { code: 'REASON_REQUIRED' },
    });
    expect(await releaseSettlementHold({ holdId: 'x', memo: '확인함' })).toMatchObject({
      error: { code: 'HOLD_NOT_FOUND' },
    });
    state.auth = fail('UNAUTHENTICATED', '로그인해 주세요');
    expect(await releaseSettlementHold({ holdId: HOLD, memo: '확인함' })).toMatchObject({
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(state.calls).toHaveLength(1);
  });
});
