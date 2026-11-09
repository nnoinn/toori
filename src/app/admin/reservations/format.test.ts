// 매물·예약 조회 화면 표시 모양 (A-103, W18). 주소 값 읽기와 주소 만들기, 상태 이름을 본다.

import { describe, expect, it } from 'vitest';

import {
  labelCancelActor,
  labelHoursBefore,
  labelOrderStatus,
  labelRefundBand,
  labelRefundReason,
  labelRefundStatus,
  lookupHref,
  toLookupTab,
  toReservationFilter,
  toSlotFilter,
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
    expect(labelHoursBefore(null)).toBe('-');
  });
});
