// 계정 이력 화면 문구(#374). 원장님 계정 이력과 운영자 [이력 보기]가 같이 쓰는 제목·설명·여는 주소를 본다.

import { describe, expect, it } from 'vitest';

import { REFUND_REASONS } from '@/db/schema/refunds';

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
  it('입점: 신청·승인은 제목만, 반려는 반려 사유. 예약이 없어 여는 주소가 없다', () => {
    expect(historyText(event('shop_applied'), { audience: 'owner' })).toEqual({
      title: '입점 신청',
      detail: null,
      href: null,
    });
    expect(historyText(event('shop_approved'), { audience: 'admin' })).toEqual({
      title: '입점 승인',
      detail: null,
      href: null,
    });
    expect(
      historyText(event('shop_rejected', { reason: '사업자등록증이 흐려요' }), {
        audience: 'owner',
      }),
    ).toEqual({ title: '입점 반려', detail: '사업자등록증이 흐려요', href: null });
  });

  it('매물 등록·재등록은 서비스·일시·판매가, 게시는 서비스·일시. 금액이 없으면 판매가를 뺀다', () => {
    const slot = { menuName: '여성 커트', startAt: RESERVATION.startAt };
    expect(
      historyText(event('slot_created', { ...slot, amount: 23450 }), { audience: 'owner' }),
    ).toEqual({
      title: '매물 등록',
      detail: '여성 커트 · 11/14(토) 14:00 · 판매가 23,450원',
      href: null,
    });
    expect(
      historyText(event('slot_relisted', { ...slot, amount: 23450 }), { audience: 'owner' }),
    ).toMatchObject({
      title: '매물 재등록',
      detail: '여성 커트 · 11/14(토) 14:00 · 판매가 23,450원',
    });
    expect(historyText(event('slot_created', slot), { audience: 'owner' }).detail).toBe(
      '여성 커트 · 11/14(토) 14:00',
    );
    expect(historyText(event('slot_relisted', slot), { audience: 'owner' }).detail).toBe(
      '여성 커트 · 11/14(토) 14:00',
    );
    expect(
      historyText(event('slot_published', { ...slot, amount: 23450 }), { audience: 'owner' }),
    ).toMatchObject({ title: '매물 게시', detail: '여성 커트 · 11/14(토) 14:00' });
  });

  it('시간대 등록은 시작 일시, 시간대 마감은 시작 일시·마감 사유. 일시가 없으면 뺀다', () => {
    expect(
      historyText(event('window_created', { startAt: RESERVATION.startAt }), { audience: 'owner' }),
    ).toEqual({ title: '시간대 등록', detail: '11/14(토) 14:00', href: null });
    expect(historyText(event('window_created'), { audience: 'owner' }).detail).toBeNull();
    expect(
      historyText(event('window_closed', { startAt: RESERVATION.startAt, reason: 'mistake' }), {
        audience: 'owner',
      }),
    ).toMatchObject({ title: '시간대 마감', detail: '11/14(토) 14:00 · 잘못 올림' });
    expect(
      historyText(event('window_closed', { reason: 'hold_released' }), { audience: 'owner' })
        .detail,
    ).toBe('결제 없이 홀딩 끝남');
  });

  it('고객 취소: 예약·서비스·시작 몇 시간 전·위약금, 원장님은 원장님 예약 상세로 연다', () => {
    const cancelled = event('reservation_cancelled', {
      ...RESERVATION,
      reason: 'customer',
      hoursBeforeStart: 30,
      rate: 30,
    });
    expect(historyText(cancelled, { audience: 'owner' })).toEqual({
      title: '고객 취소',
      detail: '예약 1234-5678-9012 · 여성 커트 · 11/14(토) 14:00 · 시작 30시간 전 · 위약금 30%',
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
      detail: '예약 1234-5678-9012 · 여성 커트 · 11/14(토) 14:00',
    });
    expect(historyText(event('reservation_cancelled'), { audience: 'admin' }).title).toBe(
      '예약 취소',
    );
  });

  it('새 예약의 금액은 원장님 이력이면 판매가, 고객 이력이면 결제액', () => {
    const booked = event('reservation_created', { ...RESERVATION, amount: 23450 });
    expect(historyText(booked, { audience: 'owner' })).toMatchObject({
      title: '새 예약',
      detail: '예약 1234-5678-9012 · 여성 커트 · 11/14(토) 14:00 · 판매가 23,450원',
    });
    expect(historyText(booked, { audience: 'admin', accountType: 'customer' })).toMatchObject({
      title: '예약',
      detail: '예약 1234-5678-9012 · 여성 커트 · 11/14(토) 14:00 · 결제 23,450원',
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
    ).toBe('예약 1234-5678-9012 · 24시간 안에 답이 없어 끝남');
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
    ).toBe('예약 1234-5678-9012 · 고객 취소 · 16,415원');
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
    ).toBe('예약 1234-5678-9012 · 노쇼 취소(방문으로 바꿈)');
  });

  it('쿠폰 사용: 쓴 예약·서비스·일시·금액, 누르면 운영자 예약 상세', () => {
    expect(
      historyText(event('coupon_used', { ...RESERVATION, amount: 3000 }), {
        audience: 'admin',
        accountType: 'customer',
      }),
    ).toEqual({
      title: '쿠폰 사용',
      detail: '예약 1234-5678-9012 · 여성 커트 · 11/14(토) 14:00 · 3,000원',
      href: '/admin/reservations/r-1',
    });
  });

  it('쿠폰 돌려받음: 예약·돌려받은 이유(원장님 사정 취소·무효)·금액', () => {
    const returned = (reason: string) =>
      historyText(event('coupon_returned', { ...RESERVATION, reason, amount: 3000 }), {
        audience: 'admin',
        accountType: 'customer',
      });
    expect(returned('owner_fault')).toEqual({
      title: '쿠폰 돌려받음',
      detail: '예약 1234-5678-9012 · 원장님 사정 취소 · 3,000원',
      href: '/admin/reservations/r-1',
    });
    expect(returned('void').detail).toBe('예약 1234-5678-9012 · 무효 · 3,000원');
  });

  it('환불 사유는 모두 이름으로 보여 준다(코드 그대로 보이지 않는다)', () => {
    for (const reason of REFUND_REASONS) {
      const { detail } = historyText(event('refund_done', { reason }), {
        audience: 'admin',
        accountType: 'customer',
      });
      expect(detail).not.toBe(reason);
      expect(detail).toMatch(/[가-힣]/);
    }
  });

  it('정산 지급은 지급액, 가입은 제목만, 알림 동의는 동의 이름, 이의제기 접수는 예약·종류(예약번호가 없으면 종류만)', () => {
    expect(historyText(event('settlement_paid', { amount: 41570 }), { audience: 'owner' })).toEqual(
      { title: '정산 지급', detail: '41,570원', href: null },
    );
    expect(historyText(event('signed_up'), { audience: 'admin' })).toEqual({
      title: '가입',
      detail: null,
      href: null,
    });
    expect(
      historyText(event('consent_agreed', { reason: 'marketing' }), {
        audience: 'admin',
        accountType: 'customer',
      }),
    ).toMatchObject({ title: '알림 동의', detail: '광고성 정보 수신' });
    expect(
      historyText(event('dispute_filed', { ...RESERVATION, reason: 'no_show' }), {
        audience: 'admin',
      }),
    ).toEqual({
      title: '이의제기 접수',
      detail: '예약 1234-5678-9012 · 노쇼 처리 오류',
      href: '/admin/reservations/r-1',
    });
    expect(
      historyText(event('dispute_filed', { reason: 'after_start' }), { audience: 'admin' }).detail,
    ).toBe('서비스 중 문제');
  });

  it('방문 처리와 노쇼 처리는 제목이 다르고, 합의 후 취소 사유를 모르면 코드를 그대로 보여 준다', () => {
    expect(
      historyText(event('visit_recorded', { ...RESERVATION, result: 'visited' }), {
        audience: 'owner',
      }).title,
    ).toBe('방문 처리');
    expect(
      historyText(event('visit_recorded', { ...RESERVATION, result: 'no_show' }), {
        audience: 'owner',
      }).title,
    ).toBe('노쇼 처리');
    expect(
      historyText(event('agreed_cancel_requested', { reason: 'unknown_reason' }), {
        audience: 'owner',
      }).detail,
    ).toBe('unknown_reason');
  });
});
