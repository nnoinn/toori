// 운영자가 새 매물 게시를 멈춘 샵(#373 ④, #472, OPS-12)의 원장님 매물 서버 함수.
// 한 시술 매물 등록 확인·등록·재등록은 PUBLISH_PAUSED로 막고 저장하지 않는다. 이미 올린 매물의 수정·마감은 그대로다(11/15 nnoinn 결정 3).
// 원장님 확인(입점 승인 포함)이 먼저라 다른 사람에게는 게시 멈춤 여부가 보이지 않는다. DB와 다른 확인은 가짜로 바꾼다

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fail, ok } from '@/lib/result';
import { PUBLISH_PAUSED_MESSAGE } from '@/server/shops/publish-pause-message';

import { checkSlotDraft, createSlot } from './new/actions';
import { checkSlotEdit, closeSlot, relistSlot, updateSlot } from './actions';

const SHOP_ID = 'shop-a';
const SLOT_ID = 'slot-a';
const PAUSED = fail('PUBLISH_PAUSED', PUBLISH_PAUSED_MESSAGE);
const SAVED = { id: 'slot-new' };

const state = vi.hoisted(() => ({
  auth: null as unknown,
  publishable: null as unknown,
}));

const calls = vi.hoisted(() => ({
  assertShopCanPublish: vi.fn(),
  validateSlotDraft: vi.fn(),
  createSlotInDb: vi.fn(),
  relistSlotInDb: vi.fn(),
  checkEditable: vi.fn(),
  updateSlotInDb: vi.fn(),
  closeSlotInDb: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('./require-approved-owner', () => ({ requireApprovedOwner: async () => state.auth }));
vi.mock('@/server/shops', () => ({
  assertShopCanPublish: async (shopId: string) => {
    calls.assertShopCanPublish(shopId);
    return state.publishable;
  },
}));
vi.mock('@/db', () => ({ getDb: () => 'db' }));
vi.mock('@/lib/request-time', () => ({
  getRequestNow: async () => new Date('2026-11-19T01:00:00Z'),
}));
vi.mock('next/cache', () => ({ refresh: calls.refresh }));
vi.mock('next/navigation', () => ({ redirect: calls.redirect }));
vi.mock('./slot-draft-store', () => ({
  validateSlotDraft: async (...args: unknown[]) => {
    calls.validateSlotDraft(...args);
    return ok({ end: new Date('2026-11-19T05:00:00Z') });
  },
}));
vi.mock('./slot-create-store', () => ({
  createSlotInDb: async (...args: unknown[]) => {
    calls.createSlotInDb(...args);
    return ok(SAVED);
  },
}));
vi.mock('./relist-store', () => ({
  relistSlotInDb: async (...args: unknown[]) => {
    calls.relistSlotInDb(...args);
    return ok(SAVED);
  },
}));
vi.mock('./slot-edit-store', () => ({
  checkEditable: async (...args: unknown[]) => {
    calls.checkEditable(...args);
    return ok({ status: 'published', startAt: new Date('2026-11-19T03:00:00Z') });
  },
  updateSlotInDb: async (...args: unknown[]) => {
    calls.updateSlotInDb(...args);
    return ok(SAVED);
  },
  closeSlotInDb: async (...args: unknown[]) => {
    calls.closeSlotInDb(...args);
    return ok(null);
  },
}));
vi.mock('./slot-edit', () => ({ editStartWindow: () => undefined }));

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear();
  state.auth = ok({ userId: 'owner-user', ownerId: 'owner-a', shopId: SHOP_ID });
  state.publishable = ok(null);
});

describe('게시를 멈춘 샵은 새 매물을 올릴 수 없다 (#472, OPS-12)', () => {
  beforeEach(() => {
    state.publishable = PAUSED;
  });

  it('등록 ①② 확인(checkSlotDraft)은 PUBLISH_PAUSED 문구를 주고 시간 확인으로 넘어가지 않는다', async () => {
    expect(await checkSlotDraft(SHOP_ID, { menuId: 'menu-a' })).toEqual(PAUSED);
    expect(calls.assertShopCanPublish).toHaveBeenCalledWith(SHOP_ID);
    expect(calls.validateSlotDraft).not.toHaveBeenCalled();
  });

  it('등록(createSlot)은 PUBLISH_PAUSED 문구를 주고 저장하지 않는다', async () => {
    expect(await createSlot(SHOP_ID, { menuId: 'menu-a' })).toEqual(PAUSED);
    expect(calls.assertShopCanPublish).toHaveBeenCalledWith(SHOP_ID);
    expect(calls.createSlotInDb).not.toHaveBeenCalled();
    expect(calls.refresh).not.toHaveBeenCalled();
  });

  it('재등록(relistSlot)은 PUBLISH_PAUSED 문구를 주고 새 매물을 만들지 않고 대시보드로 보내지 않는다', async () => {
    expect(await relistSlot(SHOP_ID, SLOT_ID)).toEqual(PAUSED);
    expect(calls.assertShopCanPublish).toHaveBeenCalledWith(SHOP_ID);
    expect(calls.relistSlotInDb).not.toHaveBeenCalled();
    expect(calls.redirect).not.toHaveBeenCalled();
  });

  it('이미 올린 매물의 수정 확인·수정·마감은 막지 않는다(결정 3)', async () => {
    expect(await checkSlotEdit(SHOP_ID, SLOT_ID, { menuId: 'menu-a' })).toEqual(
      ok({ endAt: '2026-11-19T05:00:00.000Z' }),
    );
    expect(await updateSlot(SHOP_ID, SLOT_ID, { menuId: 'menu-a' })).toEqual(ok(SAVED));
    expect(await closeSlot(SHOP_ID, SLOT_ID, 'other_channel')).toEqual(ok(null));
    expect(calls.updateSlotInDb).toHaveBeenCalledOnce();
    expect(calls.closeSlotInDb).toHaveBeenCalledOnce();
    expect(calls.assertShopCanPublish).not.toHaveBeenCalled();
  });
});

describe('게시를 멈추지 않은 샵', () => {
  it('등록 확인·등록·재등록을 그대로 한다', async () => {
    expect(await checkSlotDraft(SHOP_ID, { menuId: 'menu-a' })).toEqual(
      ok({ endAt: '2026-11-19T05:00:00.000Z' }),
    );
    expect(await createSlot(SHOP_ID, { menuId: 'menu-a' })).toEqual(ok(SAVED));
    expect(calls.createSlotInDb).toHaveBeenCalledOnce();
    expect(calls.refresh).toHaveBeenCalledOnce();

    await relistSlot(SHOP_ID, SLOT_ID);
    expect(calls.relistSlotInDb).toHaveBeenCalledOnce();
    expect(calls.redirect).toHaveBeenCalledWith('/owner');
  });
});

describe('원장님 확인이 먼저다', () => {
  it('그 샵 원장님이 아니거나 입점 승인 전이면 그 이유를 주고, 게시 멈춤은 보지 않는다', async () => {
    const forbidden = fail('SHOP_NOT_APPROVED', '입점 승인 후에 매물을 올릴 수 있어요');
    state.auth = forbidden;
    state.publishable = PAUSED;

    expect(await checkSlotDraft(SHOP_ID, { menuId: 'menu-a' })).toEqual(forbidden);
    expect(await createSlot(SHOP_ID, { menuId: 'menu-a' })).toEqual(forbidden);
    expect(await relistSlot(SHOP_ID, SLOT_ID)).toEqual(forbidden);
    expect(calls.assertShopCanPublish).not.toHaveBeenCalled();
  });
});
