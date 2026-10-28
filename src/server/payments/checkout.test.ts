// 예약·결제 가짜 결과 버전 (W9, 연결 #8, #121). 함수마다 성공 모양과 실패 코드, 같은 홀딩 안에서 다시 결제(D12),
// 실패 흉내 스위치를 본다. 로그인·DB 읽기·쿠키·시각은 가짜로 바꿔서 DB 없이 돈다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';

import type { CheckoutSlot } from './checkout-store';
import { RESERVATION_CODE_PATTERN } from './reservation-code';

const SLOT = '2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091';
const OTHER_SLOT = '9f8e7d6c-5b4a-4321-8fed-cba987654321';
const NOW = new Date('2026-11-01T03:00:00.000Z'); // 한국 시간 12시
const MINUTE = 60 * 1000;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * MINUTE);

const state = vi.hoisted(() => ({
  auth: null as unknown,
  now: new Date(),
  cookies: new Map<string, string>(),
  cookieSet: vi.fn(),
  origin: 'http://localhost:3000' as string | null,
  slots: new Map<string, unknown>(),
  phone: '010-1234-5678' as string | null,
  isNew: true,
}));

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
vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({ requireCustomer: async () => state.auth }));
vi.mock('@/server/customers', () => ({ isNewCustomer: async () => state.isNew }));
vi.mock('./checkout-store', () => ({
  readCheckoutSlot: async (slotId: string) => state.slots.get(slotId) ?? null,
  readCustomerPhone: async () => state.phone,
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
  state.auth = ok({ userId: 'user-1', customerId: 'customer-1' });
  state.now = NOW;
  state.cookies.clear();
  state.origin = 'http://localhost:3000';
  state.slots = new Map([
    [SLOT, slot(SLOT)],
    [OTHER_SLOT, slot(OTHER_SLOT)],
  ]);
  state.phone = '010-1234-5678';
  state.isNew = true;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('holdSlot', () => {
  it('10분 홀딩하고 만료 시각과 서버 시각을 ISO로 돌려준다. 홀딩은 httpOnly 쿠키에 둔다', async () => {
    expect(await holdSlot(SLOT)).toEqual(
      ok({
        slotId: SLOT,
        holdExpiresAt: at(10).toISOString(),
        serverNow: NOW.toISOString(),
      }),
    );
    expect(state.cookieSet).toHaveBeenCalledWith(
      'fake_checkout',
      expect.any(String),
      expect.objectContaining({ httpOnly: true }),
    );
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

  it('다른 매물을 홀딩 중이면 ALREADY_HOLDING과 그 매물 id', async () => {
    await holdSlot(SLOT);
    const result = await holdSlot(OTHER_SLOT);
    expect(result.ok === false && result.error).toMatchObject({
      code: 'ALREADY_HOLDING',
      heldSlotId: SLOT,
    });
  });

  it('앞 홀딩이 끝났으면 다른 매물을 홀딩할 수 있다', async () => {
    await holdSlot(SLOT);
    state.now = at(10);
    expect((await holdSlot(OTHER_SLOT)).ok).toBe(true);
  });

  it.each<[string, Partial<CheckoutSlot> | null]>([
    ['없는 매물(승인 안 된 샵 포함)', null],
    ['예약됨', { status: 'reserved' }],
    ['원장님이 마감', { status: 'closed' }],
    ['시작 시각이 지남', { startAt: at(-1) }],
    ['게시 전(예약대기)', { status: 'scheduled', publishAt: at(60) }],
  ])('%s → SLOT_NOT_AVAILABLE', async (_, change) => {
    if (change === null) state.slots.delete(SLOT);
    else state.slots.set(SLOT, slot(SLOT, change));
    const result = await holdSlot(SLOT);
    expect(result.ok === false && result.error.code).toBe('SLOT_NOT_AVAILABLE');
    expect(state.cookieSet).not.toHaveBeenCalled();
  });

  it('게시 시각이 지난 예약대기 매물은 게시중이라 홀딩된다', async () => {
    state.slots.set(SLOT, slot(SLOT, { status: 'scheduled', publishAt: at(-1) }));
    expect((await holdSlot(SLOT)).ok).toBe(true);
  });

  it('DB에 다른 고객의 홀딩이 살아 있으면 HELD_BY_OTHER, 끝났으면 된다', async () => {
    state.slots.set(SLOT, slot(SLOT, { holdCustomerId: 'customer-2', holdExpiresAt: at(5) }));
    const held = await holdSlot(SLOT);
    expect(held.ok === false && held.error.code).toBe('HELD_BY_OTHER');

    state.slots.set(SLOT, slot(SLOT, { holdCustomerId: 'customer-2', holdExpiresAt: NOW }));
    expect((await holdSlot(SLOT)).ok).toBe(true);
  });

  it('신규 고객 전용 매물은 그 샵 이력이 있으면 NEW_CUSTOMER_ONLY', async () => {
    state.slots.set(SLOT, slot(SLOT, { newCustomerOnly: true }));
    state.isNew = false;
    const result = await holdSlot(SLOT);
    expect(result.ok === false && result.error.code).toBe('NEW_CUSTOMER_ONLY');
    state.isNew = true;
    expect((await holdSlot(SLOT)).ok).toBe(true);
  });

  it('매물 id 모양이 아니면 SLOT_NOT_AVAILABLE', async () => {
    const result = await holdSlot('not-a-uuid');
    expect(result.ok === false && result.error.code).toBe('SLOT_NOT_AVAILABLE');
  });

  it('로그인·고객 모드 실패는 그대로 돌려준다', async () => {
    state.auth = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    expect(await holdSlot(SLOT)).toEqual(state.auth);
    expect(state.cookieSet).not.toHaveBeenCalled();
  });

  it('같은 브라우저의 다른 사람 홀딩은 보지 않는다', async () => {
    await holdSlot(SLOT);
    state.auth = ok({ userId: 'user-2', customerId: 'customer-2' });
    expect((await holdSlot(OTHER_SLOT)).ok).toBe(true);
    expect(await getMyHold(SLOT)).toEqual(ok(null));
  });
});

describe('releaseHold', () => {
  it('내 홀딩을 바로 풀고, 이미 풀렸어도 성공', async () => {
    await holdSlot(SLOT);
    expect(await releaseHold(SLOT)).toEqual(ok(null));
    expect(await getMyHold(SLOT)).toEqual(ok(null));
    expect(await releaseHold(SLOT)).toEqual(ok(null));
    expect((await holdSlot(OTHER_SLOT)).ok).toBe(true);
  });

  it('다른 매물 id로 부르면 아무것도 하지 않는다', async () => {
    await holdSlot(SLOT);
    expect(await releaseHold(OTHER_SLOT)).toEqual(ok(null));
    const mine = await getMyHold(SLOT);
    expect(mine.ok && mine.data).not.toBeNull();
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

  it('다른 매물이거나 만료됐거나 홀딩한 적이 없으면 null', async () => {
    expect(await getMyHold(SLOT)).toEqual(ok(null));
    await holdSlot(SLOT);
    expect(await getMyHold(OTHER_SLOT)).toEqual(ok(null));
    state.now = at(10);
    expect(await getMyHold(SLOT)).toEqual(ok(null));
  });
});

describe('startPayment', () => {
  it('결제창에 넣을 값을 돌려준다. 금액은 서버가 정하고 복귀 주소는 /payment/result', async () => {
    await holdSlot(SLOT);
    const result = await startPayment({ slotId: SLOT, ...AGREED });
    expect(result).toEqual(
      ok({
        storeId: expect.any(String),
        channelKey: expect.any(String),
        paymentId: expect.stringMatching(/^fake-/),
        orderName: '샘플 헤어 커트',
        totalAmount: 23_450,
        currency: 'CURRENCY_KRW',
        redirectUrl: 'http://localhost:3000/payment/result',
      }),
    );
  });

  it('포트원 값이 .env.local에 있으면 그 값을 쓴다', async () => {
    vi.stubEnv('NEXT_PUBLIC_PORTONE_STORE_ID', 'store-test');
    vi.stubEnv('NEXT_PUBLIC_PORTONE_CHANNEL_KEY', 'channel-test');
    await holdSlot(SLOT);
    const result = await startPayment({ slotId: SLOT, ...AGREED });
    expect(result.ok && result.data).toMatchObject({
      storeId: 'store-test',
      channelKey: 'channel-test',
    });
  });

  it('같은 홀딩 안에서 다시 부르면 새 결제 번호(D12)', async () => {
    await holdSlot(SLOT);
    const first = await startPayment({ slotId: SLOT, ...AGREED });
    const second = await startPayment({ slotId: SLOT, ...AGREED });
    expect(first.ok && second.ok && first.data.paymentId !== second.data.paymentId).toBe(true);
  });

  it.each([
    { refundPolicyAgreed: false, bookerInfoAgreed: true },
    { refundPolicyAgreed: true, bookerInfoAgreed: false },
  ])('필수 동의가 빠지면 CONSENT_REQUIRED (%o)', async (agreements) => {
    await holdSlot(SLOT);
    const result = await startPayment({ slotId: SLOT, ...agreements } as never);
    expect(result.ok === false && result.error.code).toBe('CONSENT_REQUIRED');
  });

  it('홀딩한 적이 없거나 다른 매물이면 NOT_HOLDER, 시간이 지났으면 HOLD_EXPIRED', async () => {
    const none = await startPayment({ slotId: SLOT, ...AGREED });
    expect(none.ok === false && none.error.code).toBe('NOT_HOLDER');

    await holdSlot(OTHER_SLOT);
    const other = await startPayment({ slotId: SLOT, ...AGREED });
    expect(other.ok === false && other.error.code).toBe('NOT_HOLDER');

    state.now = at(10);
    const expired = await startPayment({ slotId: OTHER_SLOT, ...AGREED });
    expect(expired.ok === false && expired.error.code).toBe('HOLD_EXPIRED');
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
  });
});

describe('confirmPayment', () => {
  async function paid() {
    await holdSlot(SLOT);
    const started = await startPayment({ slotId: SLOT, ...AGREED });
    if (!started.ok) throw new Error('startPayment 실패');
    return started.data.paymentId;
  }

  it('예약 id와 예약번호(8자리)를 돌려주고, 새로고침해도 같은 결과. 홀딩은 끝난다', async () => {
    const paymentId = await paid();
    const first = await confirmPayment({ paymentId });
    expect(first.ok && first.data.reservationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.ok && first.data.reservationCode).toMatch(RESERVATION_CODE_PATTERN);
    expect(await confirmPayment({ paymentId })).toEqual(first);
    expect(await getMyHold(SLOT)).toEqual(ok(null));
  });

  it('모르는 결제 번호면 PAYMENT_NOT_FOUND', async () => {
    await paid();
    const result = await confirmPayment({ paymentId: 'fake-unknown' });
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
    const result = await holdSlot(SLOT);
    expect(result).toEqual(
      fail('HELD_BY_OTHER', '다른 고객이 결제 중이에요. 잠시 후 다시 확인해 주세요'),
    );
    expect((await holdSlot(OTHER_SLOT)).ok).toBe(false);
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
