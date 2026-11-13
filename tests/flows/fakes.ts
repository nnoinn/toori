// 서버 흐름 테스트(회귀 테스트 ②, docs/roadmap.md "사이클 계획")의 가짜.
// 화면이 부르는 실제 서버 함수를 테스트 DB에서 차례로 부르고, 바깥 서비스(Supabase 로그인, 포트원, 웹 푸시)와 시각,
// 요청이 있어야 도는 Next.js 도구(쿠키·헤더·connection·after)만 이 파일의 가짜로 바꾼다(docs/test-scenarios.md "쓰지 않는 것").
//
// 쓰는 법(tests/flows/customer-booking.db.test.ts):
// 1. 테스트 파일 맨 위에서 vi.mock으로 모듈을 이 파일의 가짜로 바꾼다. 예: vi.mock('@/db', async () => (await import('./fakes')).fakeDb)
// 2. 테스트마다 resetFlow()로 비우고, withRollback 안에서 flow.db = tx, signIn(userId, 'customer'), flow.now = 시각을 정한다
// 3. 결제창에서 결제를 마친 것은 paidOnPortOne(), 응답 뒤에 보내는 알림은 runAfterTasks()로 돌린 뒤 flow.pushes를 본다

import { ACCOUNT_MODE_COOKIE, type AccountMode } from '@/server/auth/account-mode';
import type { PushResult } from '@/server/notifications/send-web-push';
import type { PushTarget } from '@/server/notifications/subscription-store';
import type {
  cancelPortOnePayment,
  PortOneCancel,
  PortOneLookup,
  PortOnePayment,
} from '@/server/payments/portone';

import type { TestTx } from '../db/test-db';

/** startPayment가 돌려주는 결제 뒤 돌아올 주소의 앞부분(요청 헤더 origin) */
export const FLOW_ORIGIN = 'http://localhost:3000';

/** 보낸 웹 푸시 한 건. public/sw.js가 읽는 내용(제목·내용·누르면 열 주소·계정 종류)과 받은 기기 */
export type SentPush = {
  endpoint: string;
  title: string;
  body: string;
  url: string;
  account: string;
};

/** 포트원 취소 요청 한 건 */
export type CancelCall = {
  paymentId: string;
  reason: string;
  /** 부분 취소 금액. 전액 취소면 null */
  amount: number | null;
  /** 부분 취소 때 남아 있어야 할 취소 가능 잔액. 전액 취소면 null */
  currentCancellableAmount: number | null;
};

/** 지금 테스트의 상황. 테스트마다 resetFlow()로 비운다 */
export const flow = {
  /** 서버 코드의 getDb()가 돌려줄 DB. withRollback이 준 tx를 넣는다 */
  db: null as TestTx | null,
  /** 서버 시각(getRequestNow) */
  now: new Date(0),
  /** 로그인한 사람(Supabase 세션)과 로그인 때 고른 계정 종류(account_mode 쿠키). null이면 로그인 안 함 */
  account: null as { userId: string; mode: AccountMode } | null,
  /** 응답 뒤로 미룬 일(after). runAfterTasks()로 돌린다 */
  afterTasks: [] as (() => unknown)[],
  /** 포트원에 있는 결제(결제 번호 → 결제) */
  payments: new Map<string, PortOnePayment>(),
  /** 포트원 취소 요청 */
  cancels: [] as CancelCall[],
  /** 보낸 웹 푸시 */
  pushes: [] as SentPush[],
};

export function resetFlow() {
  flow.db = null;
  flow.now = new Date(0);
  flow.account = null;
  flow.afterTasks = [];
  flow.payments = new Map();
  flow.cancels = [];
  flow.pushes = [];
}

/** 이 사람으로 로그인하고 계정 종류를 고른다(로그인 화면의 고객/원장님 토글) */
export function signIn(userId: string, mode: AccountMode) {
  flow.account = { userId, mode };
}

/** 응답 뒤로 미룬 일(알림 등)을 모두 돌린다. 돌다가 새로 미룬 일도 돌린다 */
export async function runAfterTasks() {
  while (flow.afterTasks.length > 0) {
    const tasks = flow.afterTasks.splice(0);
    for (const task of tasks) await task();
  }
}

/** 고객이 포트원 결제창에서 결제를 마쳤다. 이제 포트원에 물으면 결제 완료(PAID)로 답한다 */
export function paidOnPortOne(paymentId: string, amount: number, paidAt: Date) {
  flow.payments.set(paymentId, {
    status: 'PAID',
    amountTotal: amount,
    currency: 'KRW',
    paidAt,
    method: 'PaymentMethodCard',
    failureReason: null,
    failureCode: null,
    cancellations: [],
    cancelInProgress: false,
  });
}

/** '@/db': 서버 코드가 테스트 DB의 트랜잭션(flow.db)을 쓰게 한다 */
export const fakeDb = {
  getDb: () => {
    if (!flow.db) {
      throw new Error('flow.db가 없어요. withRollback 안에서 flow.db = tx로 넣어 주세요');
    }
    return flow.db;
  },
};

/** '@/lib/request-time': 서버 시각 */
export const fakeRequestTime = {
  getRequestNow: async () => new Date(flow.now),
};

/** '@/server/supabase/server': 로그인 세션. 서명을 확인한 사용자 id(claims.sub)만 쓴다 */
export const fakeSupabase = {
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: flow.account ? { claims: { sub: flow.account.userId } } : null,
        error: null,
      }),
    },
  }),
};

/** 'next/headers': 쿠키는 계정 종류(account_mode)만 있고, 요청 헤더는 origin만 있다 */
export const fakeNextHeaders = {
  cookies: async () => {
    const value = (name: string) =>
      name === ACCOUNT_MODE_COOKIE && flow.account ? flow.account.mode : undefined;
    return {
      get: (name: string) => {
        const found = value(name);
        return found === undefined ? undefined : { name, value: found };
      },
      getAll: () => (flow.account ? [{ name: ACCOUNT_MODE_COOKIE, value: flow.account.mode }] : []),
      has: (name: string) => value(name) !== undefined,
      set: () => {},
      delete: () => {},
    };
  },
  headers: async () => new Headers({ origin: FLOW_ORIGIN }),
};

/** 'next/server'의 요청 도구. connection은 바로 지나가고, after는 runAfterTasks()까지 미룬다 */
export const fakeNextServer = {
  connection: async () => {},
  after: (task: (() => unknown) | Promise<unknown>) => {
    flow.afterTasks.push(typeof task === 'function' ? task : () => task);
  },
};

/** '@/server/payments/portone': 결제 조회와 취소. 취소하면 그 결제에 취소 내역을 남긴다 */
export const fakePortOne = {
  getPortOnePayment: async (paymentId: string): Promise<PortOneLookup> => {
    const payment = flow.payments.get(paymentId);
    return payment ? { ok: true, payment } : { ok: false, reason: 'not_found' };
  },
  cancelPortOnePayment: async (
    ...[paymentId, reason, partial]: Parameters<typeof cancelPortOnePayment>
  ): Promise<PortOneCancel> => {
    flow.cancels.push({
      paymentId,
      reason,
      amount: partial?.amount ?? null,
      currentCancellableAmount: partial?.currentCancellableAmount ?? null,
    });
    const payment = flow.payments.get(paymentId);
    if (!payment || payment.amountTotal === null) return { ok: false, reason: 'rejected' };
    const cancelled = payment.cancellations.reduce((sum, c) => sum + (c.amount ?? 0), 0);
    const left = payment.amountTotal - cancelled;
    // 포트원처럼 잔액이 맞지 않으면 거절한다(앞선 요청이 이미 돌려줬으면 두 번 환불되지 않는다)
    if (partial && partial.currentCancellableAmount !== left) {
      return { ok: false, reason: 'rejected' };
    }
    const amount = partial?.amount ?? left;
    const id = `fake-cancel-${flow.cancels.length}`;
    flow.payments.set(paymentId, {
      ...payment,
      status: amount === left ? 'CANCELLED' : 'PARTIAL_CANCELLED',
      cancellations: [...payment.cancellations, { id, amount, reason }],
    });
    return { ok: true, cancellationId: id, amount };
  },
};

/** '@/server/notifications/send-web-push': 보낸 푸시를 flow.pushes에 남기고 받았다고 답한다 */
export const fakeWebPush = {
  sendWebPush: async (target: PushTarget, payload: string): Promise<PushResult> => {
    flow.pushes.push({
      endpoint: target.endpoint,
      ...(JSON.parse(payload) as Omit<SentPush, 'endpoint'>),
    });
    return 'sent';
  },
};

/** 서버 함수 결과({ ok, data } / { ok: false, error })에서 data를 꺼낸다. 실패면 실패 코드와 함께 테스트를 멈춘다 */
export function dataOf<T>(
  result: { ok: true; data: T } | { ok: false; error: { code: string; message?: string } },
): T {
  if (!result.ok) {
    throw new Error(`서버 함수가 실패했어요: ${result.error.code} ${result.error.message ?? ''}`);
  }
  return result.data;
}
