// 이의제기 접수 함수 (#299, W19 ①). 화면에 주는 값과 실패 코드, 저장하는 값을 본다.
// 로그인·DB·시각은 가짜로 바꿔서 DB 없이 돈다. 내 예약만 읽는지와 실제 저장은 dispute-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { kstToUtc } from '@/lib/time';

import type { DisputeRecord } from './dispute-store';
import type { DisputeTarget } from './rules';

const RESERVATION = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';

function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  target: null as (DisputeTarget & { dispute: DisputeRecord | null }) | null,
  reads: [] as unknown[],
  inserts: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireCustomer: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('./dispute-store', () => ({
  readDisputeTarget: async (tx: unknown, input: unknown) => {
    state.reads.push([tx, input]);
    return state.target;
  },
  insertDispute: async (_tx: unknown, input: unknown) => {
    state.inserts.push(input);
    return { id: 'dispute-1', createdAt: new Date('2026-11-12T03:00:00.000Z') };
  },
}));

const { getDisputeStatus, submitDispute } = await import('./dispute');

// 수요일 18:00 시작, 19:00 방문 완료 → 기한 금요일 19:00
const VISITED: DisputeTarget & { dispute: DisputeRecord | null } = {
  status: 'completed',
  startAt: kst('2026-11-11 18:00'),
  visitResult: 'visited',
  visitRecordedAt: kst('2026-11-11 19:00'),
  cancelledAt: null,
  dispute: null,
};
const CONTENT = '시술 중에 약속한 디자인과 다르게 진행됐어요';

beforeEach(() => {
  state.auth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.now = kst('2026-11-12 12:00');
  state.target = { ...VISITED };
  state.reads = [];
  state.inserts = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getDisputeStatus', () => {
  it('화면 칸을 그릴 값을 준다(내 고객 id로 읽는다)', async () => {
    expect(await getDisputeStatus(RESERVATION)).toEqual(
      ok({
        reservationId: RESERVATION,
        state: 'open',
        types: ['refund_exception', 'after_start'],
        opensAt: kst('2026-11-11 18:00').toISOString(),
        deadline: kst('2026-11-13 19:00').toISOString(),
        dispute: null,
        serverNow: state.now.toISOString(),
      }),
    );
    expect(state.reads).toEqual([
      [expect.anything(), { reservationId: RESERVATION, customerId: 'customer-1' }],
    ]);
  });

  it('이미 접수했으면 submitted와 접수 내용(종류·상태·시각)을 준다', async () => {
    state.target = {
      ...VISITED,
      dispute: {
        type: 'after_start',
        status: 'open',
        createdAt: new Date('2026-11-12T01:00:00.000Z'),
      },
    };
    const result = await getDisputeStatus(RESERVATION);
    expect(result).toMatchObject({
      ok: true,
      data: {
        state: 'submitted',
        dispute: { type: 'after_start', status: 'open', createdAt: '2026-11-12T01:00:00.000Z' },
      },
    });
  });

  it('방문 처리 전이면 기한은 null이고 open', async () => {
    state.target = { ...VISITED, status: 'confirmed', visitResult: null, visitRecordedAt: null };
    expect(await getDisputeStatus(RESERVATION)).toMatchObject({
      ok: true,
      data: { state: 'open', deadline: null },
    });
  });

  it('로그인하지 않았거나 고객 계정이 아니면 그 실패를 그대로', async () => {
    state.auth = fail('UNAUTHENTICATED', '로그인해 주세요');
    expect(await getDisputeStatus(RESERVATION)).toEqual(fail('UNAUTHENTICATED', '로그인해 주세요'));
  });

  it('id 모양이 틀리거나 내 예약이 아니면 RESERVATION_NOT_FOUND', async () => {
    expect(await getDisputeStatus('not-a-uuid')).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
    state.target = null;
    expect(await getDisputeStatus(RESERVATION)).toMatchObject({
      ok: false,
      error: { code: 'RESERVATION_NOT_FOUND' },
    });
  });
});

describe('submitDispute', () => {
  it('예약 줄을 잠그고 읽은 뒤, 앞뒤 공백을 뺀 내용과 기한을 확인한 시각(접수 시각)으로 저장한다', async () => {
    expect(
      await submitDispute({
        reservationId: RESERVATION,
        type: 'after_start',
        content: `  ${CONTENT}  `,
      }),
    ).toEqual(ok({ disputeId: 'dispute-1', createdAt: '2026-11-12T03:00:00.000Z' }));
    expect(state.reads).toEqual([
      ['tx', { reservationId: RESERVATION, customerId: 'customer-1', lock: true }],
    ]);
    expect(state.inserts).toEqual([
      {
        reservationId: RESERVATION,
        type: 'after_start',
        content: CONTENT,
        receivedAt: kst('2026-11-12 12:00'),
      },
    ]);
  });

  it('내용이 10자 미만·500자 초과이거나 종류가 없으면 INVALID_INPUT이고 저장하지 않는다', async () => {
    for (const input of [
      { type: 'after_start', content: '짧아요' },
      { type: 'after_start', content: '가'.repeat(501) },
      { type: 'unknown', content: CONTENT },
      { type: '', content: CONTENT },
    ]) {
      expect(await submitDispute({ reservationId: RESERVATION, ...input })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_INPUT' },
      });
    }
    expect(state.inserts).toEqual([]);
  });

  it('이 예약에서 고를 수 없는 종류면 INVALID_INPUT(노쇼가 아닌 예약에 노쇼 이의)', async () => {
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'no_show', content: CONTENT }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(state.inserts).toEqual([]);
  });

  it('기한이 지났으면 DEADLINE_PASSED와 기한을 준다', async () => {
    state.now = kst('2026-11-13 19:00');
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'after_start', content: CONTENT }),
    ).toEqual({
      ok: false,
      error: {
        code: 'DEADLINE_PASSED',
        message: '접수 기한이 지났어요. 카카오톡 채널로 문의해 주세요',
        deadline: kst('2026-11-13 19:00').toISOString(),
      },
    });
    expect(state.inserts).toEqual([]);
  });

  it('시작 전이면 NOT_OPEN_YET, 이미 접수했으면 ALREADY_SUBMITTED', async () => {
    state.target = { ...VISITED, status: 'confirmed', visitResult: null, visitRecordedAt: null };
    state.now = kst('2026-11-11 17:00');
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'after_start', content: CONTENT }),
    ).toMatchObject({ ok: false, error: { code: 'NOT_OPEN_YET' } });

    state.now = kst('2026-11-12 12:00');
    state.target = {
      ...VISITED,
      dispute: { type: 'refund_exception', status: 'resolved', createdAt: new Date() },
    };
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'after_start', content: CONTENT }),
    ).toMatchObject({ ok: false, error: { code: 'ALREADY_SUBMITTED' } });
    expect(state.inserts).toEqual([]);
  });

  it('id 모양이 틀리거나 내 예약이 아니면 RESERVATION_NOT_FOUND', async () => {
    expect(
      await submitDispute({ reservationId: 'nope', type: 'after_start', content: CONTENT }),
    ).toMatchObject({ ok: false, error: { code: 'RESERVATION_NOT_FOUND' } });
    state.target = null;
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'after_start', content: CONTENT }),
    ).toMatchObject({ ok: false, error: { code: 'RESERVATION_NOT_FOUND' } });
  });

  it('로컬 개발에서 DEV_FAKE_DISPUTE_FAILURE로 실패를 흉내 낸다(저장하지 않는다)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_DISPUTE_FAILURE', 'submitDispute:DEADLINE_PASSED');
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'after_start', content: CONTENT }),
    ).toMatchObject({
      ok: false,
      error: { code: 'DEADLINE_PASSED', deadline: state.now.toISOString() },
    });
    vi.stubEnv('DEV_FAKE_DISPUTE_FAILURE', 'submitDispute:ALREADY_SUBMITTED');
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'after_start', content: CONTENT }),
    ).toMatchObject({ ok: false, error: { code: 'ALREADY_SUBMITTED' } });
    expect(state.inserts).toEqual([]);
  });

  it('개발이 아니면 스위치가 있어도 진짜로 처리한다', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DEV_FAKE_DISPUTE_FAILURE', 'submitDispute:DEADLINE_PASSED');
    expect(
      await submitDispute({ reservationId: RESERVATION, type: 'after_start', content: CONTENT }),
    ).toMatchObject({ ok: true });
  });
});
