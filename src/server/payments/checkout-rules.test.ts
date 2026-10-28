// 홀딩할 수 있는 매물인지 (C-404). 매물 상태(연결 #16)와 홀딩 표시를 서버 시각으로 본다.

import { describe, expect, it } from 'vitest';

import { holdBlockReason, isMyActiveHold } from './checkout-rules';
import type { CheckoutSlot } from './checkout-store';

const NOW = new Date('2026-11-01T03:00:00.000Z');
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000);

function slot(extra: Partial<CheckoutSlot> = {}): CheckoutSlot {
  return {
    slotId: 'slot-1',
    shopId: 'shop-1',
    shopName: '샘플 헤어',
    menuName: '커트',
    status: 'published',
    publishAt: at(-60),
    startAt: at(60),
    salePrice: 14_000,
    newCustomerOnly: false,
    holdCustomerId: null,
    holdExpiresAt: null,
    ...extra,
  };
}

describe('holdBlockReason', () => {
  it.each<[string, Partial<CheckoutSlot>, ReturnType<typeof holdBlockReason>]>([
    ['게시중', {}, null],
    ['게시 시각이 지난 예약대기', { status: 'scheduled', publishAt: at(0) }, null],
    ['게시 전 예약대기', { status: 'scheduled', publishAt: at(1) }, 'SLOT_NOT_AVAILABLE'],
    ['시작 시각', { startAt: at(0) }, 'SLOT_NOT_AVAILABLE'],
    ['예약됨', { status: 'reserved' }, 'SLOT_NOT_AVAILABLE'],
    ['마감', { status: 'closed' }, 'SLOT_NOT_AVAILABLE'],
    ['취소', { status: 'cancelled' }, 'SLOT_NOT_AVAILABLE'],
    ['다른 고객 홀딩 중', { holdCustomerId: 'other', holdExpiresAt: at(1) }, 'HELD_BY_OTHER'],
    ['다른 고객 홀딩이 딱 끝남', { holdCustomerId: 'other', holdExpiresAt: at(0) }, null],
    ['내 홀딩', { holdCustomerId: 'me', holdExpiresAt: at(5) }, null],
  ])('%s → %s', (_, change, expected) => {
    expect(holdBlockReason(slot(change), 'me', NOW)).toBe(expected);
  });
});

describe('isMyActiveHold', () => {
  it.each<[string, Partial<CheckoutSlot>, boolean]>([
    ['내 홀딩', { holdCustomerId: 'me', holdExpiresAt: at(5) }, true],
    ['내 홀딩이 딱 끝남', { holdCustomerId: 'me', holdExpiresAt: at(0) }, false],
    ['다른 고객 홀딩', { holdCustomerId: 'other', holdExpiresAt: at(5) }, false],
    ['홀딩 없음', {}, false],
    [
      '내 홀딩인데 시작 시각이 지남',
      { holdCustomerId: 'me', holdExpiresAt: at(5), startAt: at(0) },
      false,
    ],
    [
      '내 홀딩인데 예약됨',
      { holdCustomerId: 'me', holdExpiresAt: at(5), status: 'reserved' },
      false,
    ],
  ])('%s → %s', (_, change, expected) => {
    expect(isMyActiveHold(slot(change), 'me', NOW)).toBe(expected);
  });
});
