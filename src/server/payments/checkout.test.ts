// 예약·결제 함수 (연결 #8, #121). 함수마다 성공 모양과 실패 코드, 같은 홀딩 안에서 다시 결제(D12), 실패 흉내 스위치를 본다.
// 홀딩 저장(hold-store)은 메모리 흉내로, 로그인·DB 읽기·쿠키·시각은 가짜로 바꿔서 DB 없이 돈다.
// 홀딩 조건(동시에 눌렀을 때 포함)이 실제 DB에서 맞는지는 hold-store.db.test.ts·hold-concurrency.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { CheckoutSlot } from './checkout-store';
import type { HoldOutcome } from './hold-store';
import { RESERVATION_CODE_PATTERN } from './reservation-code';

const SLOT = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const OTHER_SLOT = '9f8e7d6c-5b4a-4321-8fed-cba987654321';
const ME = 'customer-1';
const NOW = new Date('2026-11-01T03:00:00.000Z'); // 한국 시간 12시
const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

type AcquireInput = { slotId: string; customerId: string; now: Date };

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  cookies: new Map<string, string>(),
  cookieSet: vi.fn(),
  origin: 'http://localhost:3000' as string | null,
  slots: new Map<string, CheckoutSlot>(),
  phone: '010-1234-5678' as string | null,
  isNew: true,
  /** 정해 두면 acquireHold가 이 결과를 돌려준다(실패 코드 확인용) */
  acquireOverride: null as HoldOutcome | null,
  acquireCalls: [] as { tx: unknown; input: AcquireInput }[],
  orders: [] as Record<string, unknown>[],
  releaseCalls: [] as { slotId: string; customerId: string }[],
}));

/** 메모리 흉내: 내 다른 홀딩 → ALREADY_HOLDING, 같은 매물 → 그대로, 아니면 10분 홀딩 */
function memoryAcquire({ slotId, customerId, now }: AcquireInput): HoldOutcome {
  const active = (s: CheckoutSlot) =>
    s.holdCustomerId === customerId && s.holdExpiresAt !== null && s.holdExpiresAt > now;
  const other = [...state.slots.values()].find((s) => active(s) && s.slotId !== slotId);
  if (other) return { ok: false, code: 'ALREADY_HOLDING', heldSlotId: other.slotId };
  const slot = state.slots.get(slotId);
  if (!slot) return { ok: false, code: 'SLOT_NOT_AVAILABLE' };
  if (active(slot)) return { ok: true, holdExpiresAt: slot.holdExpiresAt! };
  const holdExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  state.slots.set(slotId, { ...slot, holdCustomerId: customerId, holdExpiresAt });
  return { ok: true, holdExpiresAt };
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = state.cookies.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options: unknown) => {
      state.cookieSet(name, value, options);
      state.cookies.set(name, value);
    },
    delete: (name: string) => state.cookies.delete(name),
  }),
  headers: async () => ({ get: (name: string) => (name === 'origin' ? state.origin : null) }),
}));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireCustomer: async () => state.auth }));
vi.mock('@/server/customers', () => ({ isNewCustomer: async () => state.isNew }));
vi.mock('./checkout-store', () => ({
  readCheckoutSlot: async (slotId: string) => state.slots.get(slotId) ?? null,
  readCustomerPhone: async () => state.phone,
}));
vi.mock('./order-store', async (importOriginal) => ({
  newPaymentId: (await importOriginal<typeof import('./order-store')>()).newPaymentId,
  createPendingOrder: async (_db: unknown, order: Record<string, unknown>) => {
    state.orders.push(order);
    return `order-${state.orders.length}`;
  },
}));
vi.mock('./hold-store', () => ({
  acquireHold: async (tx: unknown, input: AcquireInput) => {
    state.acquireCalls.push({ tx, input });
    return state.acquireOverride ?? memoryAcquire(input);
  },
  releaseMyHold: async (_db: unknown, input: { slotId: string; customerId: string }) => {
    state.releaseCalls.push(input);
    const slot = state.slots.get(input.slotId);
    if (slot?.holdCustomerId !== input.customerId) return false;
    state.slots.set(input.slotId, { ...slot, holdCustomerId: null, holdExpiresAt: null });
    return true;
  },
}));

const { confirmPayment, getMyHold, holdSlot, releaseHold, startPayment } =
  await import('./checkout');

function slot(id: string, extra: Partial<CheckoutSlot> = {}): CheckoutSlot {
  return {
    slotId: id,
    shopId: 'shop-1',
    shopName: '샘플 헤어',
    menuName: '커트',
    status: 'published',
    publishAt: at(-24 * 60),
    startAt: at(24 * 60),
    salePrice: 23_450,
    newCustomerOnly: false,
    holdCustomerId: null,
    holdExpiresAt: null,
    ...extra,
  };
}

const AGREED = { refundPolicyAgreed: true, bookerInfoAgreed: true } as const;

beforeEach(() => {
  vi.clearAllMocks();
  state.auth = ok({ userId: 'user-1', customerId: ME });
  state.now = NOW;
  state.cookies.clear();
  state.origin = 'http://localhost:3000';
  state.slots = new Map([
    [SLOT, slot(SLOT)],
    [OTHER_SLOT, slot(OTHER_SLOT)],
  ]);
  state.phone = '010-1234-5678';
  state.isNew = true;
  state.acquireOverride = null;
  state.acquireCalls = [];
  state.releaseCalls = [];
  state.orders = [];
  vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store-test');
  vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'channel-test');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('holdSlot', () => {
  it('트랜잭션 안에서 서버 시각으로 홀딩하고, 만료 시각과 서버 시각을 ISO로 돌려준다', async () => {
    expect(await holdSlot(SLOT)).toEqual(
      ok({ slotId: SLOT, holdExpiresAt: at(10).toISOString(), serverNow: NOW.toISOString() }),
    );
    expect(state.acquireCalls).toEqual([
      { tx: 'tx', input: { slotId: SLOT, customerId: ME, now: NOW } },
    ]);
  });

  it('같은 매물을 다시 누르면 남은 시간 그대로(늘리지 않는다)', async () => {
    await holdSlot(SLOT);
    state.now = at(3);
    const again = await holdSlot(SLOT);
    expect(again.ok && again.data).toMatchObject({
      holdExpiresAt: at(10).toISOString(),
      serverNow: at(3).toISOString(),
    });
  });

  it('ALREADY_HOLDING에는 지금 홀딩 중인 매물 id가 붙는다', async () => {
    await holdSlot(SLOT);
    const result = await holdSlot(OTHER_SLOT);
    expect(result.ok === false && result.error).toMatchObject({
      code: 'ALREADY_HOLDING',
      heldSlotId: SLOT,
    });
  });

  it.each(['SLOT_NOT_AVAILABLE', 'HELD_BY_OTHER', 'NEW_CUSTOMER_ONLY'] as const)(
    '홀딩이 안 된 이유 %s를 문구와 함께 돌려준다',
    async (code) => {
      state.acquireOverride = { ok: false, code };
      const result = await holdSlot(SLOT);
      expect(result.ok === false && result.error.code).toBe(code);
      expect(result.ok === false && result.error.message).toBeTruthy();
    },
  );

  it('매물 id 모양이 아니면 SLOT_NOT_AVAILABLE이고 DB를 건드리지 않는다', async () => {
    const result = await holdSlot('not-a-uuid');
    expect(result.ok === false && result.error.code).toBe('SLOT_NOT_AVAILABLE');
    expect(state.acquireCalls).toEqual([]);
  });

  it('로그인·고객 모드 실패는 그대로 돌려준다', async () => {
    state.auth = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    expect(await holdSlot(SLOT)).toEqual(state.auth);
    expect(state.acquireCalls).toEqual([]);
  });
});

describe('releaseHold', () => {
  it('내 홀딩을 바로 풀고, 이미 풀렸어도 성공', async () => {
    await holdSlot(SLOT);
    expect(await releaseHold(SLOT)).toEqual(ok(null));
    expect(state.releaseCalls).toEqual([{ slotId: SLOT, customerId: ME }]);
    expect(await getMyHold(SLOT)).toEqual(ok(null));
    expect(await releaseHold(SLOT)).toEqual(ok(null));
    expect((await holdSlot(OTHER_SLOT)).ok).toBe(true);
  });

  it('다른 고객의 홀딩은 풀지 않는다', async () => {
    state.slots.set(SLOT, slot(SLOT, { holdCustomerId: 'customer-2', holdExpiresAt: at(5) }));
    expect(await releaseHold(SLOT)).toEqual(ok(null));
    expect(state.slots.get(SLOT)?.holdCustomerId).toBe('customer-2');
  });

  it('매물 id 모양이 아니면 아무것도 하지 않고 성공', async () => {
    expect(await releaseHold('x')).toEqual(ok(null));
    expect(state.releaseCalls).toEqual([]);
  });
});

describe('getMyHold', () => {
  it('내 홀딩이면 만료 시각·서버 시각·금액(쿠폰 0)', async () => {
    await holdSlot(SLOT);
    state.now = at(4);
    expect(await getMyHold(SLOT)).toEqual(
      ok({
        slotId: SLOT,
        holdExpiresAt: at(10).toISOString(),
        serverNow: at(4).toISOString(),
        salePrice: 23_450,
        couponAmount: 0,
        amount: 23_450,
      }),
    );
  });

  it.each<[string, Partial<CheckoutSlot>]>([
    ['홀딩 없음', {}],
    ['다른 고객 홀딩', { holdCustomerId: 'customer-2', holdExpiresAt: at(5) }],
    ['내 홀딩이 끝남', { holdCustomerId: ME, holdExpiresAt: NOW }],
    ['홀딩 중 시작 시각이 지남', { holdCustomerId: ME, holdExpiresAt: at(5), startAt: NOW }],
  ])('%s → null', async (_, change) => {
    state.slots.set(SLOT, slot(SLOT, change));
    expect(await getMyHold(SLOT)).toEqual(ok(null));
  });
});

describe('startPayment', () => {
  it('결제 대기 주문을 저장하고 결제창에 넣을 값을 돌려준다. 금액은 서버가 정하고 복귀 주소는 /payment/result', async () => {
    await holdSlot(SLOT);
    state.now = at(2);
    const result = await startPayment({ slotId: SLOT, ...AGREED });
    expect(result).toEqual(
      ok({
        storeId: 'store-test',
        channelKey: 'channel-test',
        paymentId: expect.stringMatching(/^toori-[0-9a-f-]{36}$/),
        orderName: '샘플 헤어 커트',
        totalAmount: 23_450,
        currency: 'CURRENCY_KRW',
        redirectUrl: 'http://localhost:3000/payment/result',
      }),
    );
    expect(state.orders).toEqual([
      {
        paymentId: result.ok && result.data.paymentId,
        slotId: SLOT,
        customerId: ME,
        salePrice: 23_450,
        couponAmount: 0,
        amount: 23_450,
        agreedAt: at(2),
      },
    ]);
  });

  it('포트원 Store ID·채널 키가 없으면 PAYMENT_UNAVAILABLE이고 주문을 만들지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', '');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await holdSlot(SLOT);
    const result = await startPayment({ slotId: SLOT, ...AGREED });
    expect(result.ok === false && result.error.code).toBe('PAYMENT_UNAVAILABLE');
    expect(state.orders).toEqual([]);
    expect(error).toHaveBeenCalled();
  });

  it('같은 홀딩 안에서 다시 부르면 새 결제 번호·새 주문(D12)', async () => {
    await holdSlot(SLOT);
    const first = await startPayment({ slotId: SLOT, ...AGREED });
    const second = await startPayment({ slotId: SLOT, ...AGREED });
    expect(first.ok && second.ok && first.data.paymentId !== second.data.paymentId).toBe(true);
    expect(state.orders).toHaveLength(2);
  });

  it.each([
    { refundPolicyAgreed: false, bookerInfoAgreed: true },
    { refundPolicyAgreed: true, bookerInfoAgreed: false },
  ])('필수 동의가 빠지면 CONSENT_REQUIRED (%o)', async (agreements) => {
    await holdSlot(SLOT);
    const result = await startPayment({ slotId: SLOT, ...agreements } as never);
    expect(result.ok === false && result.error.code).toBe('CONSENT_REQUIRED');
  });

  it('홀딩한 적이 없거나 다른 고객이 홀딩했으면 NOT_HOLDER, 내 홀딩이 끝났으면 HOLD_EXPIRED', async () => {
    const none = await startPayment({ slotId: SLOT, ...AGREED });
    expect(none.ok === false && none.error.code).toBe('NOT_HOLDER');

    state.slots.set(SLOT, slot(SLOT, { holdCustomerId: 'customer-2', holdExpiresAt: at(5) }));
    const other = await startPayment({ slotId: SLOT, ...AGREED });
    expect(other.ok === false && other.error.code).toBe('NOT_HOLDER');

    await holdSlot(OTHER_SLOT);
    state.now = at(10);
    const expired = await startPayment({ slotId: OTHER_SLOT, ...AGREED });
    expect(expired.ok === false && expired.error.code).toBe('HOLD_EXPIRED');
    expect(state.orders).toEqual([]);
  });

  it('연락처가 없으면 PHONE_REQUIRED', async () => {
    await holdSlot(SLOT);
    state.phone = null;
    const result = await startPayment({ slotId: SLOT, ...AGREED });
    expect(result.ok === false && result.error.code).toBe('PHONE_REQUIRED');
  });

  it('신규 고객 전용은 결제 직전에 다시 확인한다', async () => {
    state.slots.set(SLOT, slot(SLOT, { newCustomerOnly: true }));
    await holdSlot(SLOT);
    state.isNew = false;
    const result = await startPayment({ slotId: SLOT, ...AGREED });
    expect(result.ok === false && result.error.code).toBe('NEW_CUSTOMER_ONLY');
  });

  it('요청 주소(origin)를 모르면 PAYMENT_UNAVAILABLE', async () => {
    await holdSlot(SLOT);
    state.origin = null;
    const result = await startPayment({ slotId: SLOT, ...AGREED });
    expect(result.ok === false && result.error.code).toBe('PAYMENT_UNAVAILABLE');
    expect(state.orders).toEqual([]);
  });
});

describe('confirmPayment', () => {
  async function paid(slotId = SLOT) {
    await holdSlot(slotId);
    const started = await startPayment({ slotId, ...AGREED });
    if (!started.ok) throw new Error('startPayment 실패');
    return started.data.paymentId;
  }

  it('예약 id와 예약번호(8자리)를 돌려주고, 새로고침해도 같은 결과. 홀딩은 풀린다', async () => {
    const paymentId = await paid();
    const first = await confirmPayment({ paymentId });
    expect(first.ok && first.data.reservationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.ok && first.data.reservationCode).toMatch(RESERVATION_CODE_PATTERN);
    expect(await confirmPayment({ paymentId })).toEqual(first);
    expect(state.slots.get(SLOT)?.holdCustomerId).toBeNull();
    expect(await getMyHold(SLOT)).toEqual(ok(null));
  });

  it('모르는 결제 번호면 PAYMENT_NOT_FOUND', async () => {
    await paid();
    const result = await confirmPayment({ paymentId: 'fake-unknown' });
    expect(result.ok === false && result.error.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('다른 매물로 다시 홀딩·결제하면 앞 매물의 결제 번호는 쓸 수 없다', async () => {
    const old = await paid(SLOT);
    await releaseHold(SLOT);
    await paid(OTHER_SLOT);
    const result = await confirmPayment({ paymentId: old });
    expect(result.ok === false && result.error.code).toBe('PAYMENT_NOT_FOUND');
  });

  it('결제창을 닫아 code가 붙어 오면 PAYMENT_CANCELLED와 홀딩이 남았는지. 같은 홀딩으로 다시 결제할 수 있다(D12)', async () => {
    const paymentId = await paid();
    state.now = at(2);
    const result = await confirmPayment({
      paymentId,
      code: 'FAILURE_TYPE_PG',
      message: '결제를 취소했어요',
    });
    expect(result.ok === false && result.error).toMatchObject({
      code: 'PAYMENT_CANCELLED',
      slotId: SLOT,
      holdActive: true,
    });
    expect((await startPayment({ slotId: SLOT, ...AGREED })).ok).toBe(true);
  });

  it('홀딩이 끝난 뒤 결제됐으면 HOLD_EXPIRED와 자동 취소 표시', async () => {
    const paymentId = await paid();
    state.now = at(11);
    const result = await confirmPayment({ paymentId });
    expect(result.ok === false && result.error).toMatchObject({
      code: 'HOLD_EXPIRED',
      autoCancelled: true,
    });
  });
});

describe('실패 흉내 스위치 DEV_FAKE_PAYMENT_FAILURE (로컬 개발만)', () => {
  it('로컬 개발에서 함수와 코드를 적으면 그 실패를 돌려준다', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'holdSlot:HELD_BY_OTHER');
    expect(await holdSlot(SLOT)).toEqual(
      fail('HELD_BY_OTHER', '다른 고객이 결제 중이에요. 잠시 후 다시 확인해 주세요'),
    );
    expect(state.acquireCalls).toEqual([]);
  });

  it('confirmPayment의 금액 불일치는 자동 취소 표시까지', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'confirmPayment:AMOUNT_MISMATCH');
    const result = await confirmPayment({ paymentId: 'fake-any' });
    expect(result.ok === false && result.error).toMatchObject({
      code: 'AMOUNT_MISMATCH',
      autoCancelled: true,
    });
  });

  it('다른 함수를 가리키거나 그 함수에 없는 코드면 평소대로', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'confirmPayment:PAYMENT_FAILED');
    expect((await holdSlot(SLOT)).ok).toBe(true);
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'holdSlot:AMOUNT_MISMATCH');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await holdSlot(SLOT)).ok).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('로컬 개발이 아니면(테스트·배포) 꺼져 있다', async () => {
    vi.stubEnv('DEV_FAKE_PAYMENT_FAILURE', 'holdSlot:HELD_BY_OTHER');
    expect((await holdSlot(SLOT)).ok).toBe(true);
  });
});
