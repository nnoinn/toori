// 이벤트별 알림 (연결 #12, #131). 받는 사람, 문구, 주소, 응답 뒤에 보내는지, 실패해도 던지지 않는지 본다. notify는 가짜로 바꾼다.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

const state = vi.hoisted(() => ({
  afterTasks: [] as (() => Promise<void>)[],
  notified: [] as unknown[],
  row: null as unknown,
  notifyError: null as Error | null,
  keptRows: [] as unknown[],
  keptReads: [] as unknown[],
}));

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => {
    state.afterTasks.push(task);
  },
}));
vi.mock('@/server/slot-windows/store', () => ({
  // 마감 때 남겼다가 닫힌 칸 고르기는 slot-windows/owner-store.db.test.ts가 실제 DB로 본다
  readReleasedKeptSlots: async (_db: unknown, slotIds: unknown) => {
    state.keptReads.push(slotIds);
    return state.keptRows;
  },
}));
vi.mock('./notify', () => ({
  notify: async (_db: unknown, input: unknown) => {
    if (state.notifyError) throw state.notifyError;
    state.notified.push(input);
  },
}));

const {
  KEPT_SLOT_RESERVED_NOTE,
  notifyAgreedCancelRequested,
  notifyAgreedCancelResult,
  notifyKeptWindowSlotsReleased,
  notifyNoShow,
  notifyNoShowReversed,
  notifyOwnerFaultCancelled,
  notifyPaymentAutoCancelled,
  notifyPayoutAccountChanged,
  notifyPublishPauseChanged,
  notifyReservationCancelled,
  notifyReservationConfirmed,
  notifyShopReviewed,
  notifySlotForceClosed,
  notifyVisitRecordedByAdmin,
  notifyWindowForceClosed,
  sendAgreedCancelResult,
} = await import('./alerts');

/** 어떤 조인이든 where에서 state.row를 돌려주는 가짜 */
const db = (() => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
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
    windowClosed: false,
  };
  state.keptRows = [];
  state.keptReads = [];
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

  it('원장님이 시간대를 마감할 때 결제 중이라 남긴 칸이면 원장님 알림에 "마감 전에 결제를 시작한 손님"을 더한다(#308 ③-2)', async () => {
    state.row = { ...(state.row as object), windowClosed: true };
    notifyReservationConfirmed(db, 'r-1');
    await runAfterTasks();
    expect(KEPT_SLOT_RESERVED_NOTE).toBe('마감 전에 결제를 시작한 손님이에요');
    expect(state.notified).toMatchObject([
      { accountType: 'customer', body: '샘플 헤어 · 11/5(목) 15:00' },
      {
        accountType: 'owner',
        title: '새 예약이 들어왔어요',
        body: '커트 · 11/5(목) 15:00 · 마감 전에 결제를 시작한 손님이에요',
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

  it('정산 계좌 변경: 원장님에게 계좌 설정으로, 은행·뒷자리는 넣지 않고 바꿀 때마다 새로 간다(#295)', async () => {
    state.row = { ownerUserId: 'owner-user' };
    notifyPayoutAccountChanged(db, { shopId: 'shop-1', changeId: 'change-1' });
    notifyPayoutAccountChanged(db, { shopId: 'shop-1', changeId: 'change-2' });
    expect(state.notified).toEqual([]);
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'payout_account.changed',
        dedupeKey: 'payout_account.changed:owner:change-1',
        title: '정산 계좌가 바뀌었어요',
        body: '직접 바꾸지 않았다면 바로 문의해 주세요',
        url: '/owner/settings/payout',
      },
      expect.objectContaining({ dedupeKey: 'payout_account.changed:owner:change-2' }),
    ]);
  });

  it('합의 후 취소 요청: 고객에게 내 예약 상세로, 다시 요청하면 새로 간다(#301)', async () => {
    notifyAgreedCancelRequested(db, { reservationId: 'r-1', requestId: 'q-1' });
    expect(state.notified).toEqual([]);
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'customer-user',
        accountType: 'customer',
        event: 'reservation.agreed_cancel_requested',
        dedupeKey: 'reservation.agreed_cancel_requested:customer:q-1',
        title: '원장님이 합의 후 취소를 요청했어요',
        body: '샘플 헤어 · 11/5(목) 15:00',
        url: '/reservations/r-1',
      },
    ]);
  });

  it('합의 후 취소 결과: 원장님에게 원장님 예약 상세로(동의·거절·만료, 재등록 안내 없음)', async () => {
    notifyAgreedCancelResult(db, { reservationId: 'r-1', requestId: 'q-1', result: 'declined' });
    await runAfterTasks();
    await sendAgreedCancelResult(db, { reservationId: 'r-1', requestId: 'q-1', result: 'expired' });
    await sendAgreedCancelResult(db, { reservationId: 'r-1', requestId: 'q-2', result: 'agreed' });
    expect(state.notified).toEqual([
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'reservation.agreed_cancel_declined',
        dedupeKey: 'reservation.agreed_cancel_declined:owner:q-1',
        title: '손님이 합의 후 취소에 동의하지 않았어요',
        body: '커트 · 11/5(목) 15:00',
        url: '/owner/reservations/r-1',
      },
      expect.objectContaining({
        event: 'reservation.agreed_cancel_expired',
        title: '합의 후 취소 요청이 만료됐어요',
      }),
      expect.objectContaining({
        event: 'reservation.agreed_cancel_agreed',
        title: '손님이 합의 후 취소에 동의했어요',
        dedupeKey: 'reservation.agreed_cancel_agreed:owner:q-2',
      }),
    ]);
  });

  it('대상을 찾지 못하면 보내지 않고, 보내다 실패해도 던지지 않는다', async () => {
    state.row = null;
    notifyReservationCancelled(db, 'r-x', { by: 'admin', now: new Date() });
    notifyPaymentAutoCancelled(db, 'order-x');
    notifyPayoutAccountChanged(db, { shopId: 'shop-x', changeId: 'change-x' });
    await runAfterTasks();
    expect(state.notified).toEqual([]);

    state.row = { customerUserId: 'customer-user', ownerUserId: 'owner-user', slotId: 's' };
    state.notifyError = new Error('push down');
    notifyNoShow(db, 'r-1');
    await expect(runAfterTasks()).resolves.toBeDefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('notifyKeptWindowSlotsReleased', () => {
  it('마감 때 남겼다가 결제 없이 닫힌 칸마다 원장님에게 칸 시각·서비스를 알린다(#308 ③-2)', async () => {
    state.keptRows = [
      {
        slotId: 'slot-7',
        ownerUserId: 'owner-user',
        menuName: '커트',
        startAt: new Date('2026-11-14T05:00:00.000Z'),
        endAt: new Date('2026-11-14T06:00:00.000Z'),
      },
    ];
    notifyKeptWindowSlotsReleased(db, ['slot-7', 'slot-8']);
    expect(state.notified).toEqual([]);
    await runAfterTasks();
    expect(state.keptReads).toEqual([['slot-7', 'slot-8']]);
    expect(state.notified).toEqual([
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'window.kept_slot_released',
        dedupeKey: 'window.kept_slot_released:owner:slot-7',
        title: '마감한 시간대의 남은 칸도 닫았어요',
        body: '결제가 끝나지 않아 11/14(토) 14:00~15:00(커트)도 닫았어요',
        url: '/owner',
      },
    ]);
  });

  it('자정을 넘겨 끝나는 칸은 끝 시각에 "(익일)"을 붙인다(끝나는 시각 표기 11/13)', async () => {
    state.keptRows = [
      {
        slotId: 'slot-late',
        ownerUserId: 'owner-user',
        menuName: '커트',
        // 한국 시간 11/14(토) 23:00 ~ 11/15 01:00
        startAt: new Date('2026-11-14T14:00:00.000Z'),
        endAt: new Date('2026-11-14T16:00:00.000Z'),
      },
    ];
    notifyKeptWindowSlotsReleased(db, ['slot-late']);
    await runAfterTasks();
    expect(state.notified).toMatchObject([
      { body: '결제가 끝나지 않아 11/14(토) 23:00~01:00(익일)(커트)도 닫았어요' },
    ]);
  });

  it('고른 칸이 없으면 보내지 않고, 칸 id가 없으면 읽지도 않는다', async () => {
    notifyKeptWindowSlotsReleased(db, ['slot-9']);
    await runAfterTasks();
    expect(state.notified).toEqual([]);
    notifyKeptWindowSlotsReleased(db, []);
    expect(state.afterTasks).toHaveLength(1);
  });
});

describe('운영자 대신 처리·노쇼 되돌리기 (#373 ③, 11/16)', () => {
  it('운영자가 대신 방문·노쇼로 처리하면 원장님에게만, 결과마다 다른 제목으로 그 예약 상세로', async () => {
    notifyVisitRecordedByAdmin(db, 'r-1', 'no_show');
    notifyVisitRecordedByAdmin(db, 'r-2', 'visited');
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'reservation.visit_recorded_by_admin',
        dedupeKey: 'reservation.visit_recorded_by_admin:owner:r-1',
        title: '운영자가 예약을 노쇼로 처리했어요',
        body: '커트 · 11/5(목) 15:00',
        url: '/owner/reservations/r-1',
      },
      expect.objectContaining({
        userId: 'owner-user',
        title: '운영자가 예약을 방문으로 처리했어요',
        url: '/owner/reservations/r-2',
      }),
    ]);
  });

  it('노쇼를 되돌리면 손님과 원장님에게 각자의 문구로', async () => {
    notifyNoShowReversed(db, 'r-1');
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'customer-user',
        accountType: 'customer',
        event: 'reservation.no_show_reversed',
        dedupeKey: 'reservation.no_show_reversed:customer:r-1',
        title: '노쇼 처리가 취소됐어요',
        body: '샘플 헤어 · 11/5(목) 15:00 예약이 방문으로 바뀌었어요',
        url: '/reservations/r-1',
      },
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'reservation.no_show_reversed',
        dedupeKey: 'reservation.no_show_reversed:owner:r-1',
        title: '운영자가 노쇼를 방문으로 바꿨어요',
        body: '커트 · 11/5(목) 15:00',
        url: '/owner/reservations/r-1',
      },
    ]);
  });

  it('예약이 없으면 보내지 않는다', async () => {
    state.row = null;
    notifyVisitRecordedByAdmin(db, 'r-x', 'no_show');
    notifyNoShowReversed(db, 'r-x');
    await runAfterTasks();
    expect(state.notified).toEqual([]);
  });
});

describe('원장님 귀책 취소 (#419, 11/15 nnoinn 문구)', () => {
  it('손님에게만 그 예약 상세로. 쓴 쿠폰을 돌려줬으면 그것도 알린다', async () => {
    notifyOwnerFaultCancelled(db, 'r-1', { couponReturned: false });
    notifyOwnerFaultCancelled(db, 'r-2', { couponReturned: true });
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'customer-user',
        accountType: 'customer',
        event: 'reservation.owner_fault_cancelled',
        dedupeKey: 'reservation.owner_fault_cancelled:customer:r-1',
        title: '원장님 사정으로 예약이 취소됐어요',
        body: '결제한 금액을 모두 돌려드리고 3,000원 쿠폰을 드렸어요',
        url: '/reservations/r-1',
      },
      expect.objectContaining({
        userId: 'customer-user',
        body: '결제한 금액을 모두 돌려드리고 3,000원 쿠폰을 드렸어요. 쓰신 쿠폰도 돌려드렸어요',
        url: '/reservations/r-2',
      }),
    ]);
  });

  it('예약이 없으면 보내지 않는다', async () => {
    state.row = null;
    notifyOwnerFaultCancelled(db, 'r-x', { couponReturned: true });
    await runAfterTasks();
    expect(state.notified).toEqual([]);
  });
});

describe('운영자 매물 관리 (#373 ④, 사유는 원장님에게 숨김)', () => {
  const CONTACT = '궁금하면 투리 카카오톡 채널로 문의해 주세요';
  const changedAt = new Date('2026-11-16T09:00:00.000Z');

  it('게시를 멈추거나 다시 열면 원장님에게만, 바꾼 시각마다 한 번', async () => {
    notifyPublishPauseChanged(db, { shopId: 'shop-1', paused: true, changedAt });
    notifyPublishPauseChanged(db, { shopId: 'shop-1', paused: false, changedAt });
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'shop.publish_paused',
        dedupeKey: `shop.publish_paused:owner:shop-1:${changedAt.toISOString()}`,
        title: '새 매물 등록이 잠시 멈췄어요',
        body: `운영자 확인 중이에요. 이미 올린 매물과 예약은 그대로예요. ${CONTACT}`,
        url: '/owner',
      },
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'shop.publish_resumed',
        dedupeKey: `shop.publish_resumed:owner:shop-1:${changedAt.toISOString()}`,
        title: '새 매물을 다시 올릴 수 있어요',
        body: '운영자 확인이 끝났어요',
        url: '/owner',
      },
    ]);
  });

  it('매물·시간대 매물을 강제 마감하면 원장님에게만 메뉴·시각과 문의 안내를 보낸다', async () => {
    state.row = {
      ...(state.row as object),
      shopId: 'shop-1',
      endAt: new Date('2026-11-05T09:00:00.000Z'),
    };
    notifySlotForceClosed(db, 'slot-1');
    notifyWindowForceClosed(db, 'window-1');
    await runAfterTasks();
    expect(state.notified).toEqual([
      {
        userId: 'owner-user',
        accountType: 'owner',
        event: 'slot.force_closed',
        dedupeKey: 'slot.force_closed:owner:slot-1',
        title: '운영자가 매물을 마감했어요',
        body: `커트 · 11/5(목) 15:00. ${CONTACT}`,
        url: '/owner',
      },
      expect.objectContaining({
        userId: 'owner-user',
        accountType: 'owner',
        event: 'window.force_closed',
        dedupeKey: 'window.force_closed:owner:window-1',
        title: '운영자가 시간대 매물을 마감했어요',
        url: '/owner',
      }),
    ]);
    const windowBody = (state.notified[1] as { body: string }).body;
    expect(windowBody).toMatch(/^11\/5\(목\) 15:00~.*18:00\. 결제가 끝난 예약은 그대로예요\. /);
    expect(windowBody.endsWith(CONTACT)).toBe(true);
  });

  it('샵·매물이 없으면 보내지 않는다', async () => {
    state.row = null;
    notifyPublishPauseChanged(db, { shopId: 'shop-x', paused: true, changedAt });
    notifySlotForceClosed(db, 'slot-x');
    notifyWindowForceClosed(db, 'window-x');
    await runAfterTasks();
    expect(state.notified).toEqual([]);
  });
});
