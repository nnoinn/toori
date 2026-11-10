// 관심 동네·찜한 샵 새 매물 알림 보내기 (C-601·C-209, W17 ②). 고객·매물 읽기와 notify는 가짜로 바꾼다.
// 어떤 고객과 매물을 고르는지는 digest-store.db.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { DigestCustomer, DigestSlot } from './digest-store';

const state = vi.hoisted(() => ({
  customers: [] as DigestCustomer[],
  slots: {} as Record<string, DigestSlot[]>,
  customerReads: [] as Record<string, unknown>[],
  slotReads: [] as Record<string, unknown>[],
  sent: [] as Record<string, unknown>[],
  failFor: null as string | null,
}));

vi.mock('./digest-store', async (original) => ({
  ...(await original<typeof import('./digest-store')>()),
  readDigestCustomers: async (_db: unknown, input: Record<string, unknown>) => {
    state.customerReads.push(input);
    return state.customers;
  },
  readDigestSlots: async (_db: unknown, input: { customerId: string }) => {
    state.slotReads.push(input);
    return state.slots[input.customerId] ?? [];
  },
}));
vi.mock('./notify', () => ({
  notify: async (_db: unknown, input: { userId: string }) => {
    if (input.userId === state.failFor) throw new Error('push down');
    state.sent.push(input);
  },
}));

const { digestMessage, isQuietHour, sendSlotDigest } = await import('./digest');

const db = {} as ReturnType<typeof getDb>;
/** 11/12 13:00(한국 시간) */
const NOW = new Date('2026-11-12T04:00:00.000Z');

function slot(extra: Partial<DigestSlot> = {}): DigestSlot {
  return {
    slotId: crypto.randomUUID(),
    discountRate: 30,
    sigunguCode: '41271',
    sigungu: '안산시 상록구',
    inArea: true,
    favorite: false,
    ...extra,
  };
}
const DANWON = { sigunguCode: '41273', sigungu: '안산시 단원구' };

beforeEach(() => {
  state.customers = [];
  state.slots = {};
  state.customerReads = [];
  state.slotReads = [];
  state.sent = [];
  state.failFor = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isQuietHour', () => {
  it.each([
    ['20:59', false],
    ['21:00', true],
    ['00:30', true],
    ['07:59', true],
    ['08:00', false],
    ['13:00', false],
  ])('한국 시간 %s → %s', (hm, quiet) => {
    expect(isQuietHour(new Date(`2026-11-12T${hm}:00+09:00`))).toBe(quiet);
  });
});

describe('digestMessage', () => {
  it('매물이 없으면 null', () => {
    expect(digestMessage([])).toBeNull();
  });

  it('관심 동네 하나: (광고)와 보내는 곳, 최대 할인율과 끄는 방법, 그 동네 목록 주소', () => {
    expect(digestMessage([slot(), slot({ discountRate: 40 })])).toEqual({
      title: '(광고) 투리 · 상록구에 새 매물 2개가 올라왔어요',
      body: '최대 40% 할인. 알림 끄기: 내 정보 > 알림 설정',
      url: '/home/list?region=41271',
    });
  });

  it('관심 동네가 여럿이면 매물이 많은 동네를 앞에 쓰고 그 동네 목록으로 간다', () => {
    const message = digestMessage([slot(), slot(DANWON), slot(DANWON)]);
    expect(message?.title).toBe('(광고) 투리 · 단원구 외 1곳에 새 매물 3개가 올라왔어요');
    expect(message?.url).toBe('/home/list?region=41273');
  });

  it('찜한 샵 매물만 있으면 찜한 샵, 관심 동네와 같이 있으면 둘 다 쓰고 찜한 샵 매물 화면으로 간다', () => {
    const onlyFavorite = slot({ ...DANWON, inArea: false, favorite: true });
    expect(digestMessage([onlyFavorite])).toMatchObject({
      title: '(광고) 투리 · 찜한 샵에 새 매물 1개가 올라왔어요',
      url: '/home/favorites',
    });
    expect(digestMessage([onlyFavorite, slot()])).toMatchObject({
      title: '(광고) 투리 · 찜한 샵과 상록구에 새 매물 2개가 올라왔어요',
      url: '/home/favorites',
    });
  });

  it('동네 목록에 없는 코드면 샵의 시·군·구 이름을 쓴다', () => {
    expect(digestMessage([slot({ sigunguCode: '99999', sigungu: '어딘가시' })])?.title).toBe(
      '(광고) 투리 · 어딘가시에 새 매물 1개가 올라왔어요',
    );
  });
});

describe('sendSlotDigest', () => {
  it('밤 시간에는 아무것도 읽지 않고 보내지 않는다', async () => {
    expect(await sendSlotDigest(db, new Date('2026-11-12T22:00:00+09:00'))).toEqual({
      customers: 0,
      sent: 0,
      failed: 0,
      skipped: 'quiet_hours',
    });
    expect(state.customerReads).toEqual([]);
  });

  it('오늘 받을 고객마다 24시간 안에 게시된 매물을 모아 하루 한 번 키로 보내고, 매물이 없는 고객은 건너뛴다', async () => {
    state.customers = [
      { customerId: 'c-1', userId: 'u-1' },
      { customerId: 'c-2', userId: 'u-2' },
    ];
    state.slots = { 'c-1': [slot()] };
    expect(await sendSlotDigest(db, NOW)).toEqual({
      customers: 2,
      sent: 1,
      failed: 0,
      skipped: null,
    });
    expect(state.customerReads).toEqual([{ dateKey: '2026-11-12', limit: 1000 }]);
    expect(state.slotReads).toEqual([
      { customerId: 'c-1', since: new Date('2026-11-11T04:00:00.000Z'), now: NOW },
      { customerId: 'c-2', since: new Date('2026-11-11T04:00:00.000Z'), now: NOW },
    ]);
    expect(state.sent).toEqual([
      {
        userId: 'u-1',
        accountType: 'customer',
        event: 'slot.digest',
        dedupeKey: 'slot.digest:customer:c-1:2026-11-12',
        title: '(광고) 투리 · 상록구에 새 매물 1개가 올라왔어요',
        body: '최대 30% 할인. 알림 끄기: 내 정보 > 알림 설정',
        url: '/home/list?region=41271',
      },
    ]);
  });

  it('한 고객이 실패해도 나머지는 보내고 실패 수를 센다', async () => {
    state.customers = Array.from({ length: 12 }, (_, i) => ({
      customerId: `c-${i}`,
      userId: `u-${i}`,
    }));
    state.slots = Object.fromEntries(state.customers.map((c) => [c.customerId, [slot()]]));
    state.failFor = 'u-3';
    expect(await sendSlotDigest(db, NOW)).toMatchObject({ customers: 12, sent: 11, failed: 1 });
    expect(console.error).toHaveBeenCalledWith('[notify] 새 매물 알림 실패:', 'Error');
  });
});
