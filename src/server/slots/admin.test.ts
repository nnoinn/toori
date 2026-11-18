// 운영자 매물 관리 (#373 ④). 권한·id 모양·사유, 저장 함수에 넘기는 값(운영자·다듬은 사유·시각), 성공했을 때만 원장님 알림을 보내는지 본다.
// 로그인·DB·시각·알림과 저장(admin-store.ts, admin-store.db.test.ts가 본다)은 가짜로 바꿔서 DB 없이 돈다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

const SHOP = '6e7f8091-ab2c-4d3e-9f40-516273849506';
const SLOT = '7f8091a2-bc3d-4e4f-8051-627384950617';
const WINDOW = '8091a2b3-cd4e-4f50-9162-738495061728';
const NOW = new Date('2026-11-16T08:00:00.000Z');

const state = vi.hoisted(() => ({
  auth: null as unknown,
  calls: [] as unknown[],
  result: null as unknown,
  notified: [] as unknown[],
}));

vi.mock('@/lib/request-time', () => ({ getRequestNow: async () => NOW }));
vi.mock('@/server/auth', () => ({ requireAdmin: async () => state.auth }));
vi.mock('@/db', () => ({
  getDb: () => ({ transaction: (run: (tx: string) => unknown) => run('tx') }),
}));
vi.mock('./admin-store', () => {
  const store =
    (name: string) =>
    async (tx: unknown, input: unknown): Promise<unknown> => {
      state.calls.push([name, tx, input]);
      return state.result;
    };
  return {
    pausePublishingInTx: store('pause'),
    resumePublishingInTx: store('resume'),
    forceCloseSlotInTx: store('closeSlot'),
    forceCloseWindowInTx: store('closeWindow'),
  };
});
vi.mock('@/server/notifications/alerts', () => ({
  notifyPublishPauseChanged: (_db: unknown, input: unknown) =>
    state.notified.push(['pause', input]),
  notifySlotForceClosed: (_db: unknown, id: string) => state.notified.push(['slot', id]),
  notifyWindowForceClosed: (_db: unknown, id: string) => state.notified.push(['window', id]),
}));

const { forceCloseSlot, forceCloseWindow, pauseShopPublishing, resumeShopPublishing } =
  await import('./admin');

const ADMIN = { adminId: 'admin-1', now: NOW };

beforeEach(() => {
  state.auth = ok({ userId: 'admin-1' });
  state.calls = [];
  state.notified = [];
});

describe('pauseShopPublishing / resumeShopPublishing', () => {
  it('운영자·다듬은 사유·시각으로 저장하고, 성공하면 원장님에게 멈춤·다시 열기 알림을 보낸다', async () => {
    state.result = ok({ shopId: SHOP, pausedAt: NOW });
    expect(await pauseShopPublishing({ shopId: SHOP, reason: ' 신고 확인 ' })).toEqual(
      ok({ shopId: SHOP, pausedAt: NOW.toISOString() }),
    );
    state.result = ok({ shopId: SHOP, resumedAt: NOW });
    expect(await resumeShopPublishing({ shopId: SHOP, memo: '확인 끝' })).toEqual(
      ok({ shopId: SHOP, resumedAt: NOW.toISOString() }),
    );
    expect(state.calls).toEqual([
      ['pause', 'tx', { ...ADMIN, shopId: SHOP, reason: '신고 확인' }],
      ['resume', 'tx', { ...ADMIN, shopId: SHOP, reason: '확인 끝' }],
    ]);
    expect(state.notified).toEqual([
      ['pause', { shopId: SHOP, paused: true, changedAt: NOW }],
      ['pause', { shopId: SHOP, paused: false, changedAt: NOW }],
    ]);
  });

  it('막히면(이미 멈춤) 알림을 보내지 않고 그 실패를 돌려준다', async () => {
    state.result = fail('ALREADY_PAUSED', '이미 새 매물 게시를 멈춘 샵이에요');
    expect(await pauseShopPublishing({ shopId: SHOP, reason: '확인' })).toMatchObject({
      error: { code: 'ALREADY_PAUSED' },
    });
    expect(state.notified).toEqual([]);
  });
});

describe('forceCloseSlot / forceCloseWindow', () => {
  it('매물을 닫고 원장님에게 알린다', async () => {
    state.result = ok({ slotId: SLOT, closedAt: NOW });
    expect(await forceCloseSlot({ slotId: SLOT, reason: '가격이 실제와 다름' })).toEqual(
      ok({ slotId: SLOT, closedAt: NOW.toISOString() }),
    );
    expect(state.calls).toEqual([
      ['closeSlot', 'tx', { ...ADMIN, slotId: SLOT, reason: '가격이 실제와 다름' }],
    ]);
    expect(state.notified).toEqual([['slot', SLOT]]);
  });

  it('시간대를 닫으면 결제 중이라 남긴 칸 수를 돌려주고 원장님에게 알린다', async () => {
    state.result = ok({
      windowId: WINDOW,
      closedAt: NOW,
      keptSlots: [{ slotId: 'kept-1' }, { slotId: 'kept-2' }],
    });
    expect(await forceCloseWindow({ windowId: WINDOW, reason: '영업 안 하는 시간' })).toEqual(
      ok({ windowId: WINDOW, closedAt: NOW.toISOString(), keptSlotCount: 2 }),
    );
    expect(state.notified).toEqual([['window', WINDOW]]);
  });

  it('손님이 결제 중이라 막히면 알림 없이 그 실패', async () => {
    state.result = fail('SLOT_ON_HOLD', '손님이 결제 중인 매물이에요');
    expect(await forceCloseSlot({ slotId: SLOT, reason: '확인' })).toMatchObject({
      error: { code: 'SLOT_ON_HOLD' },
    });
    expect(state.notified).toEqual([]);
  });
});

describe('공통 확인', () => {
  it('운영자가 아니면 그 실패, id 모양이 틀리면 대상별 NOT_FOUND, 사유가 비거나 길면 그 실패이고 저장하지 않는다', async () => {
    state.auth = fail('FORBIDDEN', '운영자만 할 수 있어요');
    expect(await forceCloseSlot({ slotId: SLOT, reason: '확인' })).toMatchObject({
      error: { code: 'FORBIDDEN' },
    });
    state.auth = ok({ userId: 'admin-1' });
    expect(await pauseShopPublishing({ shopId: 'x', reason: '확인' })).toMatchObject({
      error: { code: 'SHOP_NOT_FOUND' },
    });
    expect(await forceCloseSlot({ slotId: 'x', reason: '확인' })).toMatchObject({
      error: { code: 'SLOT_NOT_FOUND' },
    });
    expect(await forceCloseWindow({ windowId: 'x', reason: '확인' })).toMatchObject({
      error: { code: 'WINDOW_NOT_FOUND' },
    });
    expect(await resumeShopPublishing({ shopId: SHOP, memo: '  ' })).toMatchObject({
      error: { code: 'REASON_REQUIRED' },
    });
    expect(
      await forceCloseSlot({ slotId: SLOT, reason: '가'.repeat(ADMIN_REASON_LIMIT + 1) }),
    ).toMatchObject({ error: { code: 'REASON_TOO_LONG' } });
    expect(state.calls).toEqual([]);
    expect(state.notified).toEqual([]);
  });
});
