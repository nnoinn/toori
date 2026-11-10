// 이벤트별 알림 (연결 #12, #131). 받는 사람, 문구, 주소, 응답 뒤에 보내는지, 실패해도 던지지 않는지 본다. notify는 가짜로 바꾼다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const state = vi.hoisted(() => ({
  afterTasks: [] as (() => Promise<void>)[],
  notified: [] as unknown[],
  row: null as unknown,
  notifyError: null as Error | null,
}));

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => {
    state.afterTasks.push(task);
  },
}));
vi.mock('./notify', () => ({
  notify: async (_db: unknown, input: unknown) => {
    if (state.notifyError) throw state.notifyError;
    state.notified.push(input);
  },
}));

const {
  notifyNoShow,
  notifyPaymentAutoCancelled,
  notifyReservationCancelled,
  notifyReservationConfirmed,
  notifyShopReviewed,
} = await import('./alerts');

/** 어떤 조인이든 where에서 state.row를 돌려주는 가짜 */
const db = (() => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: async () => (state.row ? [state.row] : []),
  };
  return { select: () => chain } as unknown as ReturnType<typeof getDb>;
})();

const runAfterTasks = () => Promise.all(state.afterTasks.map((task) => task()));

beforeEach(() => {
  state.afterTasks = [];
  state.notified = [];
  state.notifyError = null;
  state.row = {
    customerUserId: 'customer-user',
    ownerUserId: 'owner-user',
    shopName: '샘플 헤어',
    menuName: '커트',
    startAt: new Date('2026-11-05T06:00:00.000Z'),
    slotId: 'slot-1',
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('notifyReservationConfirmed', () => {
  it('응답을 보낸 뒤에 보낸다', () => {
    notifyReservationConfirmed(db, 'r-1');
    expect(state.afterTasks).toHaveLength(1);
    expect(state.notified).toEqual([]);
  });

  it('고객과 원장님에게 각자의 문구와 주소로 보낸다(#131 표)', async () => {
    notifyReservationConfirmed(db, 'r-1');
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'customer-user',
        accountType: 'customer',
        event: 'reservation.confirmed',
        dedupeKey: 'reservation.confirmed:customer:r-1',
        title: '예약이 확정됐어요',
        body: '샘플 헤어 · 11/5(목) 15:00',
        url: '/reservations/r-1',
      },
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'reservation.confirmed',
        dedupeKey: 'reservation.confirmed:owner:r-1',
        title: '새 예약이 들어왔어요',
        body: '커트 · 11/5(목) 15:00',
        url: '/owner/reservations/r-1',
      },
    ]);
  });

  it('예약이 없으면 보내지 않는다', async () => {
    state.row = null;
    notifyReservationConfirmed(db, 'r-1');
    await runAfterTasks();
    expect(state.notified).toEqual([]);
  });

  it('알림이 실패해도 던지지 않고 로그만 남긴다', async () => {
    state.notifyError = new Error('r-1 저장 실패');
    notifyReservationConfirmed(db, 'r-1');
    await expect(runAfterTasks()).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalledWith(
      '[notify] 알림 실패:',
      'reservation.confirmed',
      'Error',
    );
  });
});

describe('W16 ② 알림(#131 표 문구·주소)', () => {
  const BEFORE_START = new Date('2026-11-05T05:00:00.000Z');
  const RELIST_ALERT = {
    userId: 'owner-user',
    accountType: 'owner',
    event: 'reservation.cancelled',
    dedupeKey: 'reservation.cancelled:owner:r-1',
    title: '예약 건이 취소되었습니다',
    body: '동일한 매물을 재등록하시겠습니까?',
    url: '/owner/slots/slot-1/relist',
  };
  const OWNER_CANCELLED_ALERT = {
    userId: 'owner-user',
    accountType: 'owner',
    event: 'reservation.cancelled',
    dedupeKey: 'reservation.cancelled:owner:r-1',
    title: '예약이 취소됐어요',
    body: '커트 · 11/5(목) 15:00',
    url: '/owner/reservations/r-1',
  };
  const CUSTOMER_CANCELLED_ALERT = {
    userId: 'customer-user',
    accountType: 'customer',
    event: 'reservation.cancelled',
    dedupeKey: 'reservation.cancelled:customer:r-1',
    title: '예약이 취소됐어요',
    body: '환불 내용은 예약 상세에서 확인해 주세요',
    url: '/reservations/r-1',
  };

  it('고객 취소: 시작 전이면 원장님에게만 재등록 화면으로', async () => {
    notifyReservationCancelled(db, 'r-1', { by: 'customer', now: BEFORE_START });
    expect(state.notified).toEqual([]);
    await runAfterTasks();
    expect(state.notified).toEqual([RELIST_ALERT]);
  });

  it('시작 시각이 됐거나 지났으면 재등록할 수 없어서 원장님에게 예약 상세로(재등록 화면 START_PASSED와 같은 기준)', async () => {
    const start = new Date('2026-11-05T06:00:00.000Z');
    notifyReservationCancelled(db, 'r-1', { by: 'customer', now: start });
    await runAfterTasks();
    expect(state.notified).toEqual([OWNER_CANCELLED_ALERT]);
  });

  it('운영자 취소: 원장님 알림에 더해 고객에게도 그 예약 상세로(시작 전·뒤 모두)', async () => {
    notifyReservationCancelled(db, 'r-1', { by: 'admin', now: BEFORE_START });
    await runAfterTasks();
    expect(state.notified).toEqual([RELIST_ALERT, CUSTOMER_CANCELLED_ALERT]);

    state.afterTasks = [];
    state.notified = [];
    notifyReservationCancelled(db, 'r-1', {
      by: 'admin',
      now: new Date('2026-11-05T07:00:00.000Z'),
    });
    await runAfterTasks();
    expect(state.notified).toEqual([OWNER_CANCELLED_ALERT, CUSTOMER_CANCELLED_ALERT]);
  });

  it('노쇼: 고객에게 그 예약 상세로', async () => {
    notifyNoShow(db, 'r-1');
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'customer-user',
        accountType: 'customer',
        event: 'reservation.no_show',
        dedupeKey: 'reservation.no_show:customer:r-1',
        title: '노쇼로 처리됐어요',
        body: '잘못 처리됐으면 문의해 주세요',
        url: '/reservations/r-1',
      },
    ]);
  });

  it('결제 자동 취소: 고객에게 내 예약 목록으로(주문 기준으로 한 번)', async () => {
    notifyPaymentAutoCancelled(db, 'order-1');
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'customer-user',
        accountType: 'customer',
        event: 'payment.auto_cancelled',
        dedupeKey: 'payment.auto_cancelled:customer:order-1',
        title: '결제가 취소됐어요',
        body: '결제가 취소되고 전액 환불돼요',
        url: '/reservations',
      },
    ]);
  });

  it('입점 승인·반려: 원장님에게 홈으로, 다시 심사하면 새로 가도록 심사 시각을 키에 넣는다', async () => {
    const reviewedAt = new Date('2026-11-09T01:00:00.000Z');
    notifyShopReviewed(db, { shopId: 'shop-1', decision: 'approve', reviewedAt });
    notifyShopReviewed(db, { shopId: 'shop-1', decision: 'reject', reviewedAt });
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'shop.approved',
        dedupeKey: 'shop.approved:owner:shop-1:2026-11-09T01:00:00.000Z',
        title: '입점이 승인됐어요',
        body: '이제 매물을 올릴 수 있어요',
        url: '/owner',
      },
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'shop.rejected',
        dedupeKey: 'shop.rejected:owner:shop-1:2026-11-09T01:00:00.000Z',
        title: '입점이 반려됐어요',
        body: '이유를 확인하고 다시 신청해 주세요',
        url: '/owner',
      },
    ]);
  });

  it('대상을 찾지 못하면 보내지 않고, 보내다 실패해도 던지지 않는다', async () => {
    state.row = null;
    notifyReservationCancelled(db, 'r-x', { by: 'admin', now: new Date() });
    notifyPaymentAutoCancelled(db, 'order-x');
    await runAfterTasks();
    expect(state.notified).toEqual([]);

    state.row = { customerUserId: 'customer-user', ownerUserId: 'owner-user', slotId: 's' };
    state.notifyError = new Error('push down');
    notifyNoShow(db, 'r-1');
    await expect(runAfterTasks()).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalled();
  });
});
