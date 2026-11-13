// 운영자 이의제기 처리 함수 (A-104, #350, W19 ②). 권한·입력 확인·실패 코드·저장에 넘기는 값을 본다.
// 로그인·DB·시각은 가짜로 바꿔서 DB 없이 돈다(실제 저장·작업 기록·보류 조건은 admin-store.db.test.ts).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { kstToUtc } from '@/lib/time';

import type { DisputeToResolve } from './admin-store';
import type { DisputeRecord } from './dispute-store';
import type { DisputeTarget } from './rules';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const DISPUTE = '6e7f8091-a2b3-4c4d-9e5f-60718293a4b5';

function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  target: null as unknown,
  reads: [] as unknown[],
  inserts: [] as unknown[],
  insertError: null as unknown,
  toResolve: null as unknown,
  resolved: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('./dispute-store', () => ({
  readDisputeTarget: async (tx: unknown, input: unknown) => {
    state.reads.push([tx, input]);
    return state.target;
  },
}));
vi.mock('./admin-store', () => ({
  insertKakaoDispute: async (_tx: unknown, input: unknown) => {
    if (state.insertError) throw state.insertError;
    state.inserts.push(input);
    return { id: 'dispute-new', createdAt: kst('2026-11-13 10:00') };
  },
  readDisputeToResolve: async () => state.toResolve,
  resolveDisputeInTx: async (_tx: unknown, input: unknown) => {
    state.resolved.push(input);
  },
}));

const { registerKakaoDispute, resolveDispute } = await import('./admin');

// 수요일 18:00 시작, 19:00 방문 완료 → 접수 기한 금요일(11/13) 19:00(영업일 48시간)
const VISITED: DisputeTarget & { dispute: DisputeRecord | null } = {
  status: 'completed',
  startAt: kst('2026-11-11 18:00'),
  visitResult: 'visited',
  visitRecordedAt: kst('2026-11-11 19:00'),
  cancelledAt: null,
  dispute: null,
};
const CONTENT = '카카오톡 채널로 받은 내용: 시술이 약속과 달랐어요';
const register = (extra: Record<string, unknown> = {}) =>
  registerKakaoDispute({
    reservationId: RESERVATION,
    type: 'after_start',
    content: `  ${CONTENT}  `,
    receivedAt: kst('2026-11-13 18:59').toISOString(),
    ...extra,
  } as never);

const OPEN_NO_SHOW: DisputeToResolve = {
  disputeId: DISPUTE,
  reservationId: RESERVATION,
  status: 'open',
  reservationStatus: 'completed',
  visitResult: 'no_show',
};
const resolve = (extra: Record<string, unknown> = {}) =>
  resolveDispute({
    disputeId: DISPUTE,
    outcome: 'no_show_reversed',
    memo: '  원장님이 방문했다고 확인함  ',
    ...extra,
  } as never);

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.now = kst('2026-11-13 20:00');
  state.target = { ...VISITED };
  state.reads = [];
  state.inserts = [];
  state.insertError = null;
  state.toResolve = { ...OPEN_NO_SHOW };
  state.resolved = [];
});

describe('registerKakaoDispute', () => {
  it('운영자만. 로그인 실패는 그대로 돌려주고 읽지 않는다', async () => {
    state.auth = fail('FORBIDDEN', '권한이 없어요');
    expect(await register()).toEqual(fail('FORBIDDEN', '권한이 없어요'));
    expect(state.reads).toEqual([]);
  });

  it('받은 시각이 기한 안이면 고객을 가리지 않고 예약 줄을 잠가 읽은 뒤, 앞뒤 공백을 뺀 내용·받은 시각·등록한 운영자로 저장한다', async () => {
    expect(await register()).toEqual(
      ok({ disputeId: 'dispute-new', createdAt: kst('2026-11-13 10:00').toISOString() }),
    );
    expect(state.reads).toEqual([
      ['tx', { reservationId: RESERVATION, customerId: null, lock: true }],
    ]);
    expect(state.inserts).toEqual([
      {
        reservationId: RESERVATION,
        type: 'after_start',
        content: CONTENT,
        receivedAt: kst('2026-11-13 18:59'),
        adminId: 'admin-1',
      },
    ]);
  });

  it('기한(금요일 19:00) 뒤에 받은 문의는 RECEIVED_AFTER_DEADLINE과 기한을 주고 등록하지 않는다(일반 문의로 응대)', async () => {
    expect(await register({ receivedAt: kst('2026-11-13 19:00').toISOString() })).toEqual({
      ok: false,
      error: {
        code: 'RECEIVED_AFTER_DEADLINE',
        message:
          '접수 기한이 지난 뒤에 받은 문의라 등록하지 않아요. 카카오톡 채널에서 일반 문의로 응대해 주세요',
        deadline: kst('2026-11-13 19:00').toISOString(),
      },
    });
    expect(state.inserts).toEqual([]);
  });

  it('이미 이의제기가 있는 예약이면 DISPUTE_EXISTS와 그 이의제기 id(앱 접수 포함)', async () => {
    state.target = {
      ...VISITED,
      dispute: { id: 'dispute-app', type: 'after_start', status: 'open', createdAt: new Date() },
    };
    expect(await register()).toMatchObject({
      ok: false,
      error: { code: 'DISPUTE_EXISTS', disputeId: 'dispute-app' },
    });
    expect(state.inserts).toEqual([]);
  });

  it('서비스 시작 전에 받았으면 NOT_OPEN_YET, 이 예약에서 고를 수 없는 종류면 INVALID_INPUT, 없는 예약이면 RESERVATION_NOT_FOUND', async () => {
    expect(await register({ receivedAt: kst('2026-11-11 17:59').toISOString() })).toMatchObject({
      ok: false,
      error: { code: 'NOT_OPEN_YET' },
    });
    expect(await register({ type: 'no_show' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    state.target = null;
    expect(await register()).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    expect(state.inserts).toEqual([]);
  });

  it('입력 확인: 예약 id·종류·내용(빈칸·5,000자 초과)·받은 시각(모양·지금보다 뒤)이 틀리면 읽지 않는다', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ reservationId: 'x' }, 'RESERVATION_NOT_FOUND'],
      [{ type: 'unknown' }, 'INVALID_INPUT'],
      [{ content: '   ' }, 'DISPUTE_CONTENT_REQUIRED'],
      [{ content: '가'.repeat(5001) }, 'DISPUTE_CONTENT_TOO_LONG'],
      [{ receivedAt: '어제' }, 'RECEIVED_AT_INVALID'],
      [{ receivedAt: kst('2026-11-13 20:01').toISOString() }, 'RECEIVED_AT_INVALID'],
    ];
    for (const [extra, code] of cases) {
      expect(await register(extra), code).toMatchObject({ ok: false, error: { code } });
    }
    expect(state.reads).toEqual([]);
  });

  it('확인 뒤 같은 예약에 다른 접수가 먼저 저장돼 DB가 막으면 DISPUTE_EXISTS, 다른 오류는 그대로 던진다', async () => {
    state.insertError = Object.assign(new Error('중복'), {
      constraint_name: 'disputes_reservation_id_unique',
    });
    expect(await register()).toMatchObject({ ok: false, error: { code: 'DISPUTE_EXISTS' } });
    state.insertError = new Error('연결 끊김');
    await expect(register()).rejects.toThrow('연결 끊김');
  });
});

describe('resolveDispute', () => {
  it('운영자만. 로그인 실패는 그대로', async () => {
    state.auth = fail('FORBIDDEN', '권한이 없어요');
    expect(await resolve()).toEqual(fail('FORBIDDEN', '권한이 없어요'));
    expect(state.resolved).toEqual([]);
  });

  it('잠가 읽은 이의제기에 결론·앞뒤 공백을 뺀 메모·운영자·서버 시각을 넘기고 결론과 기록 시각을 돌려준다', async () => {
    expect(await resolve()).toEqual(
      ok({
        disputeId: DISPUTE,
        outcome: 'no_show_reversed',
        handledAt: kst('2026-11-13 20:00').toISOString(),
      }),
    );
    expect(state.resolved).toEqual([
      {
        dispute: OPEN_NO_SHOW,
        outcome: 'no_show_reversed',
        memo: '원장님이 방문했다고 확인함',
        adminId: 'admin-1',
        now: kst('2026-11-13 20:00'),
      },
    ]);
  });

  it('돈이 오가는 결론은 OUTCOME_NOT_READY, 노쇼가 아닌 예약에 노쇼 결론은 OUTCOME_NOT_ALLOWED, 이미 결론이 났으면 ALREADY_RESOLVED', async () => {
    for (const outcome of ['refund_exception', 'voided', 'owner_fault_cancel']) {
      expect(await resolve({ outcome }), outcome).toMatchObject({
        ok: false,
        error: {
          code: 'OUTCOME_NOT_READY',
          message: '이 결론은 처리 기능을 준비 중이에요. 확인 중으로 두고 기다려 주세요',
        },
      });
    }
    state.toResolve = { ...OPEN_NO_SHOW, visitResult: 'visited' };
    expect(await resolve()).toMatchObject({ ok: false, error: { code: 'OUTCOME_NOT_ALLOWED' } });
    expect((await resolve({ outcome: 'no_change' })).ok).toBe(true);
    state.toResolve = { ...OPEN_NO_SHOW, status: 'resolved' };
    expect(await resolve()).toMatchObject({ ok: false, error: { code: 'ALREADY_RESOLVED' } });
    state.toResolve = null;
    expect(await resolve()).toMatchObject({ ok: false, error: { code: 'DISPUTE_NOT_FOUND' } });
    expect(state.resolved).toHaveLength(1);
  });

  it('입력 확인: 이의제기 id·결론 종류·메모(빈칸이면 MEMO_REQUIRED)가 틀리면 기록하지 않는다', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ disputeId: 'x' }, 'DISPUTE_NOT_FOUND'],
      [{ outcome: 'unknown' }, 'INVALID_INPUT'],
      [{ memo: '  ' }, 'MEMO_REQUIRED'],
      [{ memo: '가'.repeat(5001) }, 'DISPUTE_CONTENT_TOO_LONG'],
    ];
    for (const [extra, code] of cases) {
      expect(await resolve(extra), code).toMatchObject({ ok: false, error: { code } });
    }
    expect(state.resolved).toEqual([]);
  });
});
