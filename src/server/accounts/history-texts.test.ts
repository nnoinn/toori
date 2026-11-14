// 계정 이력 화면 문구(#374). 원장님 계정 이력과 운영자 [이력 보기]가 같이 쓰는 제목·설명·여는 주소를 본다.

import { describe, expect, it } from 'vitest';

import { historyText } from './history-texts';
import type { AccountHistoryEvent, AccountHistoryKind } from './history-types';

function event(
  kind: AccountHistoryKind,
  fields: Partial<AccountHistoryEvent> = {},
): AccountHistoryEvent {
  return {
    key: `${kind}:1`,
    at: '2026-11-12T12:50:00.000Z',
    kind,
    reservationId: null,
    reservationCode: null,
    menuName: null,
    startAt: null,
    amount: null,
    rate: null,
    hoursBeforeStart: null,
    reason: null,
    result: null,
    ...fields,
  };
}

const RESERVATION = {
  reservationId: 'r-1',
  reservationCode: '123456789012',
  menuName: '여성 커트',
  // 한국 시간 11/14(토) 14:00
  startAt: '2026-11-14T05:00:00.000Z',
};

describe('계정 이력 문구', () => {
  it('고객 취소: 예약·서비스·시작 몇 시간 전·위약금, 원장님은 원장님 예약 상세로 연다', () => {
    const cancelled = event('reservation_cancelled', {
      ...RESERVATION,
      reason: 'customer',
      hoursBeforeStart: 30,
      rate: 30,
    });
    expect(historyText(cancelled, { audience: 'owner' })).toEqual({
      title: '고객 취소',
      detail: '예약 123456789012 · 여성 커트 · 11/14(토) 14:00 · 시작 30시간 전 · 위약금 30%',
      href: '/owner/reservations/r-1',
    });
    expect(historyText(cancelled, { audience: 'admin' }).href).toBe('/admin/reservations/r-1');
  });

  it('원장님 사정 취소는 위약금 없이, 모르는 취소한 사람은 "예약 취소"', () => {
    expect(
      historyText(event('reservation_cancelled', { ...RESERVATION, reason: 'owner_fault' }), {
        audience: 'owner',
      }),
    ).toMatchObject({
      title: '원장님 사정 취소',
      detail: '예약 123456789012 · 여성 커트 · 11/14(토) 14:00',
    });
    expect(historyText(event('reservation_cancelled'), { audience: 'admin' }).title).toBe(
      '예약 취소',
    );
  });

  it('새 예약의 금액은 원장님 이력이면 판매가, 고객 이력이면 결제액', () => {
    const booked = event('reservation_created', { ...RESERVATION, amount: 23450 });
    expect(historyText(booked, { audience: 'owner' })).toMatchObject({
      title: '새 예약',
      detail: '예약 123456789012 · 여성 커트 · 11/14(토) 14:00 · 판매가 23,450원',
    });
    expect(historyText(booked, { audience: 'admin', accountType: 'customer' })).toMatchObject({
      title: '예약',
      detail: '예약 123456789012 · 여성 커트 · 11/14(토) 14:00 · 결제 23,450원',
    });
  });

  it('매물 마감은 사유 이름, 정산 계좌 변경은 은행 이름, 알림 동의는 동의 이름. 예약이 없으면 여는 주소가 없다', () => {
    expect(
      historyText(event('slot_closed', { menuName: '여성 커트', reason: 'other_channel' }), {
        audience: 'owner',
      }),
    ).toEqual({ title: '매물 마감', detail: '여성 커트 · 다른 곳 예약', href: null });
    expect(
      historyText(event('payout_account_changed', { reason: '004' }), { audience: 'owner' }),
    ).toMatchObject({
      title: '정산 계좌 변경',
      detail: 'KB국민은행',
    });
    expect(
      historyText(event('consent_withdrawn', { reason: 'interest_alert' }), {
        audience: 'admin',
        accountType: 'customer',
      }),
    ).toMatchObject({ title: '알림 동의 철회', detail: '관심 동네·찜한 샵 새 매물 알림' });
  });

  it('합의 후 취소: 원장님은 "요청", 고객은 "요청 받음", 결과는 손님 답', () => {
    const requested = event('agreed_cancel_requested', {
      ...RESERVATION,
      reason: 'style_mismatch',
    });
    expect(historyText(requested, { audience: 'owner' }).title).toBe('합의 후 취소 요청');
    expect(historyText(requested, { audience: 'admin', accountType: 'customer' }).title).toBe(
      '합의 후 취소 요청 받음',
    );
    expect(
      historyText(event('agreed_cancel_resolved', { ...RESERVATION, result: 'expired' }), {
        audience: 'owner',
      }).detail,
    ).toBe('예약 123456789012 · 24시간 안에 답이 없어 끝남');
  });

  it('방문·노쇼, 환불, 쿠폰, 이의제기', () => {
    expect(
      historyText(event('visit_recorded', { ...RESERVATION, result: 'no_show' }), {
        audience: 'owner',
      }).title,
    ).toBe('노쇼 처리');
    expect(
      historyText(
        event('refund_done', { ...RESERVATION, reason: 'customer_cancel', amount: 16415 }),
        {
          audience: 'admin',
          accountType: 'customer',
        },
      ).detail,
    ).toBe('예약 123456789012 · 고객 취소 · 16,415원');
    expect(
      historyText(event('coupon_issued', { amount: 3000, reason: 'owner_fault_compensation' }), {
        audience: 'admin',
        accountType: 'customer',
      }).detail,
    ).toBe('3,000원 · 원장님 사정 취소 보상');
    expect(
      historyText(event('dispute_resolved', { ...RESERVATION, result: 'no_show_reversed' }), {
        audience: 'admin',
        accountType: 'customer',
      }).detail,
    ).toBe('예약 123456789012 · 노쇼 취소(방문으로 바꿈)');
  });
});
