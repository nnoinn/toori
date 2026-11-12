// 시간대 매물 가짜 결과 버전 (#308). 원장님 함수(등록·지난 설정·마감)와 고객 함수(목록·상세·[예약하기])의 결과 모양,
// 권한, 실패 코드, 스위치를 본다. 로그인·DB 읽기·시각은 가짜로 바꿔서 DB 없이 돈다(실제 DB 읽기는 store.db.test.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_FILTERS } from '@/features/map/filters';
import { fail, ok } from '@/lib/result';
import { kstToUtc } from '@/lib/time';

import type { ShopMenu } from './rules';
import type { Range } from './starts';
import type { AreaShop } from './store';

const SHOP = '5d6e7f80-9a1b-4c2d-8e3f-405162738495';
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
  areaShops: [] as AreaShop[],
  profile: null as unknown,
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => state.now }));
vi.mock('@/server/auth', () => ({
  requireShopOwner: async () => state.owner,
  requireCustomer: async () => state.customer,
}));
vi.mock('@/server/shops', () => ({ assertShopApproved: async () => state.approved }));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('./store', () => ({
  readWindowShop: async () => ({ businessHours: [], menus: state.menus }),
  readShopBusyRanges: async () => state.busy,
  readOccupiedRanges: async () => state.occupied,
  readAreaShops: async () => state.areaShops,
  readWindowShopProfile: async () => state.profile,
}));

const { closeSlotWindow, createSlotWindows, getLastWindowSettings, holdWindowSlot } =
  await import('./actions');
const { getSlotWindow, listSlotWindows } = await import('./queries');

const fakeOn = () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEV_FAKE_SLOT_WINDOWS', 'on');
};

beforeEach(() => {
  state.owner = ok({ userId: 'owner-user', ownerId: 'owner-1', shopId: SHOP });
  state.customer = ok({ userId: 'customer-user', customerId: 'customer-1' });
  state.approved = ok(null);
  state.now = NOW;
  state.menus = [CUT, PERM];
  state.busy = [];
  state.occupied = [];
  state.areaShops = [
    {
      shopId: SHOP,
      name: '샘플 헤어',
      category: 'hair',
      lat: 37.32,
      lng: 126.83,
      imagePath: null,
    },
  ];
  state.profile = {
    shop: { shopId: SHOP, name: '샘플 헤어' },
    imagePaths: [],
    category: 'hair',
  };
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

  it('스위치를 켜면 확인을 통과했을 때 묶음마다 시간대 결과(가짜 버전은 저장하지 않는다)', async () => {
    fakeOn();
    const result = await createSlotWindows(SHOP, input);
    expect(result).toMatchObject({
      ok: true,
      data: {
        windows: [
          {
            windowId: expect.stringMatching(/^[0-9a-f-]{36}$/),
            startAt: at('10:00', 13).toISOString(),
            endAt: at('12:00', 13).toISOString(),
            publishAt: NOW.toISOString(),
            status: 'published',
          },
          { startAt: at('13:00', 13).toISOString(), endAt: at('18:00', 13).toISOString() },
        ],
      },
    });
  });

  it('스위치가 꺼진 곳(배포 주소)에서는 확인을 통과해도 저장한 것처럼 성공하지 않는다', async () => {
    expect(await createSlotWindows(SHOP, input)).toEqual({
      ok: false,
      error: { code: 'NOT_OPEN', message: '시간대 매물은 곧 열려요' },
    });
  });

  it('확인 실패는 스위치와 상관없이 코드와 문구로: 겹침, 긴 메뉴, 모양이 틀린 입력', async () => {
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
  it('스위치를 끄면 지난 설정 없음, 켜면 숨기지 않은 메뉴 두 개를 30%로', async () => {
    expect(await getLastWindowSettings(SHOP)).toEqual(ok(null));
    fakeOn();
    expect(await getLastWindowSettings(SHOP)).toEqual(
      ok({
        menus: [
          { menuId: CUT.id, discountRate: 30 },
          { menuId: PERM.id, discountRate: 30 },
        ],
        newCustomerOnly: false,
      }),
    );
  });

  it('마감: 스위치를 켜면 마감 시각, 꺼져 있으면 NOT_OPEN. 원장님이 고르지 않는 사유(hold_released)는 받지 않는다', async () => {
    const windowId = '99999999-9999-4999-8999-999999999999';
    expect(await closeSlotWindow(SHOP, { windowId, reason: 'mistake' })).toEqual({
      ok: false,
      error: { code: 'NOT_OPEN', message: '시간대 매물은 곧 열려요' },
    });
    fakeOn();
    expect(await closeSlotWindow(SHOP, { windowId, reason: 'mistake' })).toEqual(
      ok({ closedAt: NOW.toISOString() }),
    );
    expect(await closeSlotWindow(SHOP, { windowId, reason: 'hold_released' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });
});

describe('listSlotWindows·getSlotWindow (고객)', () => {
  const query = { sigunguCode: '41273', filters: EMPTY_FILTERS, customerId: null, now: NOW };

  it('스위치가 꺼져 있으면 시간대가 없다', async () => {
    expect(await listSlotWindows('db' as never, query)).toEqual([]);
    expect(
      await getSlotWindow('db' as never, { windowId: SHOP, customerId: null, now: NOW }),
    ).toBeNull();
  });

  it('켜면 범위 안 샵마다 내일 13:00~18:00 가짜 시간대 카드(시간대 id = 샵 id)', async () => {
    fakeOn();
    expect(await listSlotWindows('db' as never, query)).toEqual([
      {
        windowId: SHOP,
        shopId: SHOP,
        shopName: '샘플 헤어',
        category: 'hair',
        lat: 37.32,
        lng: 126.83,
        imageUrl: null,
        startAt: at('13:00', 13).toISOString(),
        endAt: at('18:00', 13).toISOString(),
        menuCount: 2,
        firstMenuName: '커트',
        maxDiscountRate: 30,
        minSalePrice: 14_000,
        newCustomerOnly: false,
        earliestStartAt: at('13:00', 13).toISOString(),
      },
    ]);
  });

  it('필터에 맞는 서비스가 없거나 남은 시간에 들어가는 서비스가 없으면 그 시간대를 뺀다', async () => {
    fakeOn();
    expect(
      await listSlotWindows('db' as never, {
        ...query,
        filters: { ...EMPTY_FILTERS, services: ['color'] },
      }),
    ).toEqual([]);
    state.occupied = [{ start: at('13:00', 13), end: at('18:00', 13) }];
    expect(await listSlotWindows('db' as never, query)).toEqual([]);
  });

  it('상세: 서비스마다 시작 가능 시각과 끝나는 시각, 샵·사진', async () => {
    fakeOn();
    state.occupied = [{ start: at('13:00', 13), end: at('16:00', 13) }];
    const detail = await getSlotWindow('db' as never, {
      windowId: SHOP,
      customerId: null,
      now: NOW,
    });
    expect(detail).toMatchObject({
      windowId: SHOP,
      shop: { shopId: SHOP, name: '샘플 헤어' },
      imageUrls: [],
      newCustomerOnly: false,
      serverNow: NOW.toISOString(),
    });
    const cut = detail!.menus.find((menu) => menu.menuId === CUT.id)!;
    expect(cut.starts[0]).toEqual({
      startAt: at('16:00', 13).toISOString(),
      endAt: at('17:00', 13).toISOString(),
    });
    // 펌 3시간은 16:00~18:00에 들어가지 않는다
    expect(detail!.menus.find((menu) => menu.menuId === PERM.id)!.starts).toEqual([]);
  });

  it('승인된 샵이 아니면 null', async () => {
    fakeOn();
    state.profile = null;
    expect(
      await getSlotWindow('db' as never, { windowId: SHOP, customerId: null, now: NOW }),
    ).toBeNull();
  });
});

describe('holdWindowSlot (고객)', () => {
  const hold = (startAt: string, menuId = CUT.id) =>
    holdWindowSlot({ windowId: SHOP, menuId, startAt });

  it('스위치가 꺼져 있으면 SLOT_NOT_AVAILABLE', async () => {
    expect(await hold(at('13:00', 13).toISOString())).toMatchObject({
      ok: false,
      error: { code: 'SLOT_NOT_AVAILABLE' },
    });
  });

  it('고를 수 없는 시각이면 TIME_TAKEN, 시간대에 없는 서비스면 SLOT_NOT_AVAILABLE', async () => {
    fakeOn();
    state.occupied = [{ start: at('13:00', 13), end: at('14:00', 13) }];
    expect(await hold(at('13:00', 13).toISOString())).toMatchObject({
      ok: false,
      error: {
        code: 'TIME_TAKEN',
        message: '방금 다른 고객이 그 시간을 골랐어요. 다른 시각을 골라 주세요',
      },
    });
    expect(
      await hold(at('14:00', 13).toISOString(), '44444444-4444-4444-8444-444444444444'),
    ).toMatchObject({ ok: false, error: { code: 'SLOT_NOT_AVAILABLE' } });
  });

  it('고를 수 있는 시각이어도 가짜 버전은 홀딩하지 않고 안내한다', async () => {
    fakeOn();
    expect(await hold(at('14:00', 13).toISOString())).toEqual({
      ok: false,
      error: {
        code: 'SLOT_NOT_AVAILABLE',
        message: '시간대 예약은 진짜 버전에서 열려요(가짜 결과 버전)',
      },
    });
  });

  it('실패 흉내 스위치: ALREADY_HOLDING', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_FAKE_SLOT_WINDOWS_FAILURE', 'holdWindowSlot:ALREADY_HOLDING');
    expect(await hold(at('14:00', 13).toISOString())).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_HOLDING' },
    });
  });
});
