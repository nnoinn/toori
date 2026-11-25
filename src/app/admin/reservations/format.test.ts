// 매물·예약 조회 화면 표시 모양 (A-103, W18). 주소 값 읽기와 주소 만들기, 상태 이름을 본다.

import { describe, expect, it } from 'vitest';

import { badgeVariants } from '@/components/ui/badge';

import {
  canForceCloseSlot,
  canForceCloseWindow,
  HOLDING_BADGE,
  labelCancelActor,
  labelHoursBefore,
  labelOrderStatus,
  labelRefundBand,
  labelRefundReason,
  labelRefundStatus,
  labelSlotCloseReason,
  lookupHref,
  reservationBadge,
  REVIEW_BADGE,
  SLOT_STATUS_BADGES,
  SLOT_ORIGIN_LABELS,
  slotDetailHref,
  windowDetailHref,
  slotOrigin,
  toLookupTab,
  toReservationFilter,
  toReservationSort,
  toSlotFilter,
  toWindowFilter,
  VOID_BADGE,
  WINDOW_FILTER_LABELS,
  WINDOW_STATE_BADGES,
  WINDOW_FILTERS,
  WINDOW_STATE_LABELS,
} from './format';

describe('매물·예약 조회 표시 모양', () => {
  it('주소 값이 이상하면 기본값', () => {
    expect(toLookupTab('slots')).toBe('slots');
    expect(toLookupTab('x')).toBe('reservations');
    expect(toReservationFilter('review')).toBe('review');
    expect(toReservationFilter(undefined)).toBe('all');
    expect(toSlotFilter('closed')).toBe('closed');
    expect(toSlotFilter('no_show')).toBe('all');
  });

  it('목록 주소에는 기본값을 넣지 않고 검색어를 인코딩한다', () => {
    expect(lookupHref({ tab: 'reservations' })).toBe('/admin/reservations');
    expect(lookupHref({ tab: 'reservations', status: 'all' })).toBe('/admin/reservations');
    expect(lookupHref({ tab: 'slots', status: 'closed', query: '샘플 & 헤어' })).toBe(
      '/admin/reservations?tab=slots&status=closed&q=%EC%83%98%ED%94%8C+%26+%ED%97%A4%EC%96%B4',
    );
  });

  it('예약 목록 정렬: 기본은 최신 예약 순이고, 주소에는 기본값을 넣지 않으며 매물 목록에는 붙지 않는다(#360 1번)', () => {
    expect(toReservationSort('start_soon')).toBe('start_soon');
    expect(toReservationSort(undefined)).toBe('latest');
    expect(toReservationSort('newest')).toBe('latest');
    expect(lookupHref({ tab: 'reservations', sort: 'latest' })).toBe('/admin/reservations');
    expect(lookupHref({ tab: 'reservations', status: 'confirmed', sort: 'oldest' })).toBe(
      '/admin/reservations?status=confirmed&sort=oldest',
    );
    expect(lookupHref({ tab: 'slots', sort: 'oldest' })).toBe('/admin/reservations?tab=slots');
  });

  it('주문·취소·환불 이름. 모르는 값은 그대로, 없으면 -', () => {
    expect(labelOrderStatus('auto_cancelled')).toBe('자동 취소');
    expect(labelOrderStatus('new')).toBe('new');
    expect(labelCancelActor('customer')).toBe('고객');
    expect(labelCancelActor(null)).toBe('-');
    expect(labelRefundReason('auto_cancel')).toBe('자동 취소');
    expect(labelRefundStatus('requested')).toBe('진행 중');
    expect(labelRefundStatus('done')).toBe('끝남');
    expect(labelRefundBand('6h_to_24h')).toBe('6~24시간');
    expect(labelRefundBand(null)).toBe('-');
  });

  it('취소할 때 남은 시간. 시작 뒤 취소도 뜻이 통하게 보여준다', () => {
    expect(labelHoursBefore(30.46)).toBe('30.5시간 전');
    expect(labelHoursBefore(-2)).toBe('시작 2.0시간 뒤');
    // 딱 시작할 때 취소는 "0.0시간 전"
    expect(labelHoursBefore(0)).toBe('0.0시간 전');
    expect(labelHoursBefore(null)).toBe('-');
  });

  it('매물 상세 주소는 매물·예약 메뉴 아래(왼쪽 메뉴가 그대로 켜진다)', () => {
    expect(slotDetailHref('abc')).toBe('/admin/reservations/slots/abc');
  });

  it('시간대 매물 상세 주소도 매물·예약 메뉴 아래(#567)', () => {
    expect(windowDetailHref('abc')).toBe('/admin/reservations/windows/abc');
  });

  it('매물 마감 사유. 원장님이 고른 셋, 결제 없이 홀딩 끝남, 운영자 마감. 모르는 값은 그대로, 없으면 -', () => {
    expect(labelSlotCloseReason('other_channel')).toBe('다른 곳 예약');
    expect(labelSlotCloseReason('mistake')).toBe('잘못 올림');
    expect(labelSlotCloseReason('other')).toBe('기타');
    expect(labelSlotCloseReason('hold_released')).toBe('결제 없이 홀딩 끝남');
    expect(labelSlotCloseReason('admin')).toBe('운영자 마감');
    expect(labelSlotCloseReason('new_reason')).toBe('new_reason');
    expect(labelSlotCloseReason(null)).toBe('-');
  });

  it('매물을 올린 방식: 시간대 칸이 먼저, 그다음 재등록, 둘 다 아니면 한 시술 매물', () => {
    expect(slotOrigin({ windowId: null, relistedFromSlotId: null })).toBe('single');
    expect(slotOrigin({ windowId: null, relistedFromSlotId: 'old' })).toBe('relist');
    expect(slotOrigin({ windowId: 'w', relistedFromSlotId: null })).toBe('window');
    expect(slotOrigin({ windowId: 'w', relistedFromSlotId: 'old' })).toBe('window');
    expect(SLOT_ORIGIN_LABELS.relist).toBe('취소된 매물을 재등록');
  });

  it('강제 마감 버튼: 판매 전(게시예정·게시중)이고 결제 중이 아니며 시간대 안의 칸이 아닐 때만', () => {
    const now = new Date('2026-11-20T03:00:00.000Z');
    const slot = {
      status: 'scheduled' as const,
      publishAt: new Date('2026-11-19T03:00:00.000Z'),
      startAt: new Date('2026-11-21T03:00:00.000Z'),
      holdCustomerId: null,
      holdExpiresAt: null,
      windowId: null,
    };
    expect(canForceCloseSlot(slot, now)).toBe(true);
    // 게시 전(게시예정)도 판매 전이다
    expect(
      canForceCloseSlot({ ...slot, publishAt: new Date('2026-11-20T04:00:00.000Z') }, now),
    ).toBe(true);
    expect(canForceCloseSlot({ ...slot, status: 'reserved' }, now)).toBe(false);
    // 시작 시각이 지나면 마감으로 보여서 닫을 것이 없다
    expect(canForceCloseSlot({ ...slot, startAt: now }, now)).toBe(false);
    // 손님이 결제 중이면 안 되고, 홀딩이 끝났으면 된다
    const hold = { holdCustomerId: 'c-1', holdExpiresAt: new Date('2026-11-20T03:05:00.000Z') };
    expect(canForceCloseSlot({ ...slot, ...hold }, now)).toBe(false);
    expect(canForceCloseSlot({ ...slot, ...hold, holdExpiresAt: now }, now)).toBe(true);
    // 시간대 안에서 손님이 만든 칸은 그 시간대를 마감한다
    expect(canForceCloseSlot({ ...slot, windowId: 'w-1' }, now)).toBe(false);
  });
});

describe('시간대 매물 탭 표시 모양(#567)', () => {
  it('탭 값 windows를 읽고, 상태 거르기 값이 이상하면 전체', () => {
    expect(toLookupTab('windows')).toBe('windows');
    expect(toWindowFilter('published')).toBe('published');
    expect(toWindowFilter('full')).toBe('all');
    expect(toWindowFilter(undefined)).toBe('all');
  });

  it('거르기는 전체·게시예정·게시중·마감 순서이고, 상태 이름은 다 참까지 넷이다', () => {
    expect(WINDOW_FILTERS.map((filter) => WINDOW_FILTER_LABELS[filter])).toEqual([
      '전체',
      '게시예정',
      '게시중',
      '마감',
    ]);
    expect(WINDOW_STATE_LABELS).toEqual({
      scheduled: '게시예정',
      published: '게시중',
      full: '다 참',
      closed: '마감',
    });
  });

  it('시간대 탭 주소는 tab=windows와 상태·검색어', () => {
    expect(lookupHref({ tab: 'windows' })).toBe('/admin/reservations?tab=windows');
    expect(lookupHref({ tab: 'windows', status: 'published', query: '샘플 헤어' })).toBe(
      '/admin/reservations?tab=windows&status=published&q=%EC%83%98%ED%94%8C+%ED%97%A4%EC%96%B4',
    );
  });

  it('마감하지 않았고 끝나지 않은 시간대만 강제 마감 단추를 보인다(다 찬 시간대 포함)', () => {
    expect(canForceCloseWindow('scheduled')).toBe(true);
    expect(canForceCloseWindow('published')).toBe(true);
    expect(canForceCloseWindow('full')).toBe(true);
    expect(canForceCloseWindow('closed')).toBe(false);
  });
});

describe('상태 배지 색 (#587, 11/24 nnoinn 손 점검)', () => {
  it('예약: 예정 진한 초록, 이용 완료 회색, 노쇼 빨강, 취소 흐린 회색 테두리', () => {
    expect(reservationBadge('confirmed', null)).toBe('default');
    expect(reservationBadge('completed', 'visited')).toBe('muted');
    expect(reservationBadge('completed', 'no_show')).toBe('destructive');
    expect(reservationBadge('cancelled', null)).toBe('faded');
  });

  it('매물: 게시예정 테두리만, 게시중 연한 초록, 예약됨 진한 초록, 마감·완료 회색, 취소 흐린 회색 테두리', () => {
    expect(SLOT_STATUS_BADGES).toEqual({
      scheduled: 'outline',
      published: 'soft',
      reserved: 'default',
      closed: 'muted',
      completed: 'muted',
      cancelled: 'faded',
    });
  });

  it('시간대 매물: 게시예정 테두리만, 게시중 연한 초록, 다 참 진한 초록, 마감 회색', () => {
    expect(WINDOW_STATE_BADGES).toEqual({
      scheduled: 'outline',
      published: 'soft',
      full: 'default',
      closed: 'muted',
    });
  });

  it('같은 뜻이면 같은 색: 예약 예정 = 매물 예약됨 = 시간대 다 참, 예약 취소 = 매물 취소, 이용 완료 = 매물 완료', () => {
    expect(reservationBadge('confirmed', null)).toBe(SLOT_STATUS_BADGES.reserved);
    expect(SLOT_STATUS_BADGES.reserved).toBe(WINDOW_STATE_BADGES.full);
    expect(reservationBadge('cancelled', null)).toBe(SLOT_STATUS_BADGES.cancelled);
    expect(reservationBadge('completed', 'visited')).toBe(SLOT_STATUS_BADGES.completed);
  });

  it('결제 중·확인 필요는 주황, 무효는 흐린 회색 테두리. 결제 중은 예약됨(진한 초록)과 다르다', () => {
    expect(HOLDING_BADGE).toBe('warning');
    expect(REVIEW_BADGE).toBe('warning');
    expect(VOID_BADGE).toBe('faded');
    expect(HOLDING_BADGE).not.toBe(SLOT_STATUS_BADGES.reserved);
  });

  it('매물 상태끼리는 판매 중·예약됨·끝남·취소가 모두 다른 색이다(한눈에 구분)', () => {
    const { published, reserved, closed, cancelled, scheduled } = SLOT_STATUS_BADGES;
    expect(new Set([scheduled, published, reserved, closed, cancelled]).size).toBe(5);
  });

  it('공통 Badge에 더한 네 색은 연한 초록·회색·흐린 회색 테두리·연한 주황이고, 원래 색은 그대로다', () => {
    expect(badgeVariants({ variant: 'soft' })).toContain('bg-primary/15 text-primary');
    expect(badgeVariants({ variant: 'muted' })).toContain('bg-muted text-muted-foreground');
    expect(badgeVariants({ variant: 'faded' })).toContain('border-border text-muted-foreground');
    expect(badgeVariants({ variant: 'warning' })).toContain(
      'bg-warning/25 text-warning-foreground',
    );
    expect(badgeVariants({ variant: 'secondary' })).toContain(
      'bg-secondary text-secondary-foreground',
    );
    expect(badgeVariants()).toContain('bg-primary text-primary-foreground');
  });
});
