// 시간대 매물 서버 함수 (#308). 원장님 함수(등록·지난 설정·마감, 진짜 버전 ①)는 권한·확인·저장에 넘기는 값·실패 코드를,
// 고객 [예약하기](아직 홀딩하지 않음)는 고른 서비스·시각 확인과 실패 코드를 본다. 로그인·DB·시각은 가짜로 바꿔서 DB 없이 돈다
// (실제 DB 읽기·저장과 고객 목록·상세는 store.db.test.ts, owner-store.db.test.ts, queries.db.test.ts, 계산은 view.test.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { kstToUtc } from '@/lib/time';

import type { ShopMenu } from './rules';
import type { Range } from './starts';
import type { WindowHoldOutcome } from './hold-store';

const SHOP = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
const WINDOW_ID = '6e7f8091-a2b3-4c4d-9e5f-60718293a4b5';
/** 2026-11-12(목) 한국 시간 'HH:MM', day로 날짜를 바꾼다 */
const at = (hm: string, day = 12) => {
  const [hour, minute] = hm.split(':').map(Number);
  return kstToUtc({ year: 2026, month: 11, day, hour, minute });
};
const NOW = at('12:00');

const CUT: ShopMenu = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceType: 'cut',
  name: '커트',
  description: null,
  listPrice: 20_000,
  durationMinutes: 60,
  hidden: false,
};
const PERM: ShopMenu = {
  id: '22222222-2222-4222-8222-222222222222',
  serviceType: 'perm',
  name: '펌',
  description: null,
  listPrice: 80_000,
  durationMinutes: 180,
  hidden: false,
};

const state = vi.hoisted(() => ({
  owner: null as unknown,
  customer: null as unknown,
  approved: null as unknown,
  now: new Date(),
  menus: [] as ShopMenu[],
  busy: [] as Range[],
  occupied: [] as Range[],
  holdCalls: [] as unknown[],
  holdOutcome: null as WindowHoldOutcome | null,
  holdError: null as unknown,
  inserted: [] as unknown[],
  insertError: null as unknown,
  closed: [] as unknown[],
  closeOutcome: null as unknown,
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({
  requireShopOwner: async () => state.owner,
  requireCustomer: async () => state.customer,
}));
vi.mock('@/server/shops', () => ({ assertShopApproved: async () => state.approved }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('./store', () => ({
  readWindowShop: async () => ({ businessHours: [], menus: state.menus }),
  readShopBusyRanges: async () => state.busy,
  readOccupiedRanges: async () => state.occupied,
  // 목록·상세 읽기는 queries.db.test.ts가 실제 DB로 본다
  readAreaWindows: async () => [],
  readOccupiedRangesByShop: async () => new Map(),
  readWindowShopProfile: async () => null,
  insertSlotWindows: async (
    tx: unknown,
    input: { windows: { start: Date; end: Date; publishAt: Date; status: string }[] },
  ) => {
    if (state.insertError) throw state.insertError;
    state.inserted.push({ tx, ...input });
    return input.windows.map((window, index) => ({
      id: `window-${index + 1}`,
      startAt: window.start,
      endAt: window.end,
      publishAt: window.publishAt,
      status: window.status,
    }));
  },
  closeWindow: async (_db: unknown, input: unknown) => {
    state.closed.push(input);
    return state.closeOutcome;
  },
}));

vi.mock('./hold-store', () => ({
  // 홀딩 저장(칸 만들기·한 사람 한 개·결제 없이 끝난 칸 닫기)은 hold-store.db.test.ts가 실제 DB로 본다
  acquireWindowHold: async (tx: unknown, input: unknown) => {
    state.holdCalls.push({ tx, input });
    if (state.holdError) throw state.holdError;
    return state.holdOutcome;
  },
}));

const { closeSlotWindow, createSlotWindows, getLastWindowSettings, holdWindowSlot } =
  await import('./actions');

beforeEach(() => {
  state.owner = ok({ userId: 'owner-user', ownerId: 'owner-1', shopId: SHOP });
  state.customer = ok({ userId: 'customer-user', customerId: 'customer-1' });
  state.approved = ok(null);
  state.inserted = [];
  state.insertError = null;
  state.closed = [];
  state.closeOutcome = { ok: true, closedAt: NOW };
  state.now = NOW;
  state.menus = [CUT, PERM];
  state.busy = [];
  state.occupied = [];
  state.holdCalls = [];
  state.holdOutcome = { ok: true, slotId: 'slot-1', holdExpiresAt: at('12:10') };
  state.holdError = null;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('createSlotWindows (원장님)', () => {
  const input = {
    ranges: [
      { startAt: at('10:00', 13).toISOString(), endAt: at('12:00', 13).toISOString() },
      { startAt: at('13:00', 13).toISOString(), endAt: at('18:00', 13).toISOString() },
    ],
    menus: [
      { menuId: CUT.id, discountRate: 30 },
      { menuId: PERM.id, discountRate: 20 },
    ],
    newCustomerOnly: false,
  };

  it('확인을 통과하면 합친 묶음·서비스 값·만든 원장님을 한 트랜잭션으로 저장하고 저장한 시간대를 돌려준다', async () => {
    const result = await createSlotWindows(SHOP, { ...input, newCustomerOnly: true });
    expect(result).toEqual({
      ok: true,
      data: {
        windows: [
          {
            windowId: 'window-1',
            startAt: at('10:00', 13).toISOString(),
            endAt: at('12:00', 13).toISOString(),
            publishAt: NOW.toISOString(),
            status: 'published',
          },
          {
            windowId: 'window-2',
            startAt: at('13:00', 13).toISOString(),
            endAt: at('18:00', 13).toISOString(),
            publishAt: NOW.toISOString(),
            status: 'published',
          },
        ],
      },
    });
    expect(state.inserted).toEqual([
      {
        tx: 'tx',
        shopId: SHOP,
        createdBy: 'owner-user',
        newCustomerOnly: true,
        windows: [
          expect.objectContaining({ start: at('10:00', 13), end: at('12:00', 13) }),
          expect.objectContaining({ start: at('13:00', 13), end: at('18:00', 13) }),
        ],
        menus: [
          expect.objectContaining({ menuId: CUT.id, discountRate: 30, salePrice: 14_000 }),
          expect.objectContaining({ menuId: PERM.id, discountRate: 20, salePrice: 64_000 }),
        ],
      },
    ]);
  });

  it('확인 뒤 다른 요청이 같은 시간을 먼저 저장해서 DB가 막으면 WINDOW_OVERLAP, 다른 DB 오류는 그대로 던진다', async () => {
    state.insertError = Object.assign(new Error('exclusion'), {
      constraint_name: 'slot_windows_no_overlap',
    });
    expect(await createSlotWindows(SHOP, input)).toEqual({
      ok: false,
      error: { code: 'WINDOW_OVERLAP', message: '같은 시간에 이미 올린 매물이나 시간대가 있어요' },
    });
    state.insertError = new Error('connection lost');
    await expect(createSlotWindows(SHOP, input)).rejects.toThrow('connection lost');
  });

  it('확인에 실패하면 저장하지 않고 코드와 문구로: 겹침, 긴 메뉴, 모양이 틀린 입력', async () => {
    state.busy = [{ start: at('17:00', 13), end: at('19:00', 13) }];
    expect(await createSlotWindows(SHOP, input)).toEqual({
      ok: false,
      error: { code: 'WINDOW_OVERLAP', message: '같은 시간에 이미 올린 매물이나 시간대가 있어요' },
    });
    state.busy = [];
    expect(
      await createSlotWindows(SHOP, {
        ...input,
        ranges: [input.ranges[0]],
        menus: [{ menuId: PERM.id, discountRate: 30 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'MENU_TOO_LONG' } });
    expect(
      await createSlotWindows(SHOP, { ...input, ranges: [{ startAt: 'x', endAt: 'y' }] }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(state.inserted).toEqual([]);
  });

  it('내 샵이 아니거나 입점 승인 전이면 그 실패', async () => {
    state.owner = fail('FORBIDDEN', '권한이 없어요');
    expect(await createSlotWindows(SHOP, input)).toEqual(fail('FORBIDDEN', '권한이 없어요'));
    state.owner = ok({ userId: 'owner-user', ownerId: 'owner-1', shopId: SHOP });
    state.approved = fail('SHOP_NOT_APPROVED', '입점 승인 뒤에 올릴 수 있어요');
    expect(await createSlotWindows(SHOP, input)).toEqual(
      fail('SHOP_NOT_APPROVED', '입점 승인 뒤에 올릴 수 있어요'),
    );
  });

  it('실패 흉내 스위치', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_SLOT_WINDOWS_FAILURE', 'createSlotWindows:OUTSIDE_HOURS');
    expect(await createSlotWindows(SHOP, input)).toMatchObject({
      ok: false,
      error: { code: 'OUTSIDE_HOURS' },
    });
  });
});

describe('getLastWindowSettings·closeSlotWindow (원장님)', () => {
  const windowId = '99999999-9999-4999-8999-999999999999';

  it('지난 설정: 내 샵이 아니면 그 실패', async () => {
    state.owner = fail('FORBIDDEN', '권한이 없어요');
    expect(await getLastWindowSettings(SHOP)).toEqual(fail('FORBIDDEN', '권한이 없어요'));
  });

  it('마감: 내 샵·시간대·고른 사유·서버 시각으로 마감하고 마감 시각을 돌려준다', async () => {
    expect(await closeSlotWindow(SHOP, { windowId, reason: 'mistake' })).toEqual(
      ok({ closedAt: NOW.toISOString() }),
    );
    expect(state.closed).toEqual([{ shopId: SHOP, windowId, reason: 'mistake', now: NOW }]);
  });

  it('마감: 없는·남의 시간대, 이미 마감·끝난 시간대는 그 코드와 문구로', async () => {
    state.closeOutcome = { ok: false, code: 'WINDOW_NOT_FOUND' };
    expect(await closeSlotWindow(SHOP, { windowId, reason: 'mistake' })).toEqual({
      ok: false,
      error: { code: 'WINDOW_NOT_FOUND', message: '시간대를 찾을 수 없어요' },
    });
    state.closeOutcome = { ok: false, code: 'WINDOW_CLOSED' };
    expect(await closeSlotWindow(SHOP, { windowId, reason: 'mistake' })).toEqual({
      ok: false,
      error: { code: 'WINDOW_CLOSED', message: '이미 마감한 시간대예요' },
    });
  });

  it('마감: 원장님이 고르지 않는 사유(hold_released)나 모양이 틀린 id는 받지 않는다', async () => {
    expect(await closeSlotWindow(SHOP, { windowId, reason: 'hold_released' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(await closeSlotWindow(SHOP, { windowId: 'x', reason: 'mistake' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(state.closed).toEqual([]);
  });
});

describe('holdWindowSlot (고객)', () => {
  const hold = (startAt = at('14:00', 13).toISOString(), menuId = CUT.id) =>
    holdWindowSlot({ windowId: WINDOW_ID, menuId, startAt });

  it('그 고객 계정·서버 시각으로 한 트랜잭션에서 홀딩하고, 매물 id·만료 시각·서버 시각을 준다', async () => {
    expect(await hold()).toEqual(
      ok({
        slotId: 'slot-1',
        holdExpiresAt: at('12:10').toISOString(),
        serverNow: NOW.toISOString(),
      }),
    );
    expect(state.holdCalls).toEqual([
      {
        tx: 'tx',
        input: {
          windowId: WINDOW_ID,
          menuId: CUT.id,
          startAt: at('14:00', 13),
          customerId: 'customer-1',
          now: NOW,
        },
      },
    ]);
  });

  it('홀딩하지 못한 이유를 실패 코드로: 한 사람 한 개는 홀딩 중인 매물 id를 같이 준다', async () => {
    state.holdOutcome = { ok: false, code: 'ALREADY_HOLDING', heldSlotId: 'slot-9' };
    expect(await hold()).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_HOLDING', heldSlotId: 'slot-9' },
    });
    for (const code of ['SLOT_NOT_AVAILABLE', 'NEW_CUSTOMER_ONLY', 'TIME_TAKEN'] as const) {
      state.holdOutcome = { ok: false, code };
      expect(await hold(), code).toMatchObject({ ok: false, error: { code } });
    }
  });

  it('확인 뒤 다른 손님이 같은 시간을 먼저 홀딩해서 DB가 막으면(slots_no_overlap) TIME_TAKEN, 다른 오류는 그대로 던진다', async () => {
    state.holdError = Object.assign(new Error('겹침'), { constraint_name: 'slots_no_overlap' });
    expect(await hold()).toMatchObject({
      ok: false,
      error: {
        code: 'TIME_TAKEN',
        message: '방금 다른 고객이 그 시간을 골랐어요. 다른 시각을 골라 주세요',
      },
    });
    state.holdError = new Error('연결 끊김');
    await expect(hold()).rejects.toThrow('연결 끊김');
  });

  it('입력 모양이 틀리면 홀딩하지 않고 SLOT_NOT_AVAILABLE, 로그인 실패는 그대로', async () => {
    expect(await hold('어제')).toMatchObject({ ok: false, error: { code: 'SLOT_NOT_AVAILABLE' } });
    expect(await hold(undefined, 'menu')).toMatchObject({
      ok: false,
      error: { code: 'SLOT_NOT_AVAILABLE' },
    });
    state.customer = fail('WRONG_MODE', '고객 계정으로 바꿔서 이용해 주세요');
    expect(await hold()).toMatchObject({ ok: false, error: { code: 'WRONG_MODE' } });
    expect(state.holdCalls).toEqual([]);
  });

  it('실패 흉내 스위치: ALREADY_HOLDING', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_SLOT_WINDOWS_FAILURE', 'holdWindowSlot:ALREADY_HOLDING');
    expect(await hold()).toMatchObject({ ok: false, error: { code: 'ALREADY_HOLDING' } });
    expect(state.holdCalls).toEqual([]);
  });
});
