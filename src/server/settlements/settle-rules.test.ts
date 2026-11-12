// 거래 하나의 정산 종류와 지급 일정 (X-205, X-206, A-104, #353).
// 기댓값: 기술 가이드 7장 "정산 주기"(서비스 뒤 4~8일 예시)·"이의제기"(처리가 늦으면 그때부터)·"앱을 거치지 않은 취소"(기준 금액 0),
// CLAUDE.md 원장님 귀책 취소(기준 금액 0)·노쇼(판매가 정산).

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';

import {
  isReadyToSettle,
  type SettleTarget,
  settlementKindOf,
  settlementSchedule,
} from './settle-rules';

/** 한국 시간 'YYYY-MM-DD HH:MM' → UTC Date */
function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

const HOUR = 60 * 60 * 1000;

/** 서비스 시작 1시간 뒤 방문 완료로 처리한 예약 */
function visited(start: string, extra: Partial<SettleTarget> = {}): SettleTarget {
  const startAt = kst(start);
  return {
    status: 'completed',
    startAt,
    visitResult: 'visited',
    visitRecordedAt: new Date(startAt.getTime() + HOUR),
    cancelledAt: null,
    cancelActor: null,
    cancelPenaltyRate: null,
    hasAdminRefund: false,
    ...extra,
  };
}

/** 서비스 시작 전에 취소된 예약 */
function cancelled(
  actor: SettleTarget['cancelActor'],
  penaltyRate: number | null,
  extra: Partial<SettleTarget> = {},
): SettleTarget {
  return visited('2026-11-15 15:00', {
    status: 'cancelled',
    visitResult: null,
    visitRecordedAt: null,
    cancelledAt: kst('2026-11-14 09:00'),
    cancelActor: actor,
    cancelPenaltyRate: penaltyRate,
    ...extra,
  });
}

describe('settlementKindOf: 정산 종류', () => {
  it('이용 완료는 sale, 노쇼는 no_show(판매가 정산)', () => {
    expect(settlementKindOf(visited('2026-11-15 15:00'))).toEqual({ kind: 'sale' });
    expect(settlementKindOf(visited('2026-11-15 15:00', { visitResult: 'no_show' }))).toEqual({
      kind: 'no_show',
    });
  });

  it('고객 취소는 penalty, 합의 후 취소는 agreed_cancel이고 환불 기록의 위약금 비율을 같이 준다', () => {
    expect(settlementKindOf(cancelled('customer', 30))).toEqual({
      kind: 'penalty',
      penaltyRate: 30,
    });
    expect(settlementKindOf(cancelled('agreed', 50))).toEqual({
      kind: 'agreed_cancel',
      penaltyRate: 50,
    });
  });

  it.each([
    ['원장님 귀책 취소', cancelled('owner_fault', null)],
    ['원장님 귀책 취소(비율이 들어와도)', cancelled('owner_fault', 0)],
    ['운영자 취소', cancelled('admin', null)],
    ['자동 취소', cancelled('system', null)],
    ['환불이 아직 끝나지 않은 고객 취소', cancelled('customer', null)],
    ['예정 예약', visited('2026-11-15 15:00', { status: 'confirmed', visitResult: null })],
    [
      '운영자 취소 환불이 있는 이용 완료(포트원 콘솔에서 일부 취소)',
      visited('2026-11-15 15:00', { hasAdminRefund: true }),
    ],
    ['운영자 취소 환불이 있는 고객 취소', cancelled('customer', 30, { hasAdminRefund: true })],
  ])('%s는 정산 줄이 없다(기준 금액 0)', (_, target) => {
    expect(settlementKindOf(target)).toBeNull();
  });
});

describe('settlementSchedule: 지급 일정', () => {
  const now = kst('2026-11-15 16:00');

  it.each([
    ['일요일 15시 서비스 → 4일 뒤 목요일', '2026-11-15 15:00', '2026-11-19'],
    ['금요일 15시 서비스 → 6일 뒤 목요일', '2026-11-20 15:00', '2026-11-26'],
    ['수요일 18시 서비스 → 8일 뒤 목요일', '2026-11-18 18:00', '2026-11-26'],
  ])('기술 가이드 예시: %s', (_, start, payoutDate) => {
    expect(settlementSchedule(visited(start), { hasOpenDispute: false, now })).toEqual({
      status: 'scheduled',
      payoutDate,
    });
  });

  it('방문 처리가 늦으면 처리한 때부터 센다(일요일 서비스를 수요일 10시에 처리 → 다음 주 목요일)', () => {
    const late = visited('2026-11-15 15:00', { visitRecordedAt: kst('2026-11-18 10:00') });
    expect(settlementSchedule(late, { hasOpenDispute: false, now })).toEqual({
      status: 'scheduled',
      payoutDate: '2026-11-26',
    });
  });

  it('확인 중 이의제기가 있으면 보류하고 지급일이 없다', () => {
    expect(settlementSchedule(visited('2026-11-15 15:00'), { hasOpenDispute: true, now })).toEqual({
      status: 'held',
    });
  });

  it('기한이 지났는데 아직 묶이지 않았으면 지금 뒤 돌아오는 지급일이다(목요일 묶기가 끝난 뒤 결론이 남)', () => {
    const target = visited('2026-11-15 15:00');
    expect(
      settlementSchedule(target, { hasOpenDispute: false, now: kst('2026-11-19 10:00') }),
    ).toEqual({ status: 'scheduled', payoutDate: '2026-11-26' });
    expect(
      settlementSchedule(target, { hasOpenDispute: false, now: kst('2026-11-24 10:00') }),
    ).toEqual({ status: 'scheduled', payoutDate: '2026-11-26' });
  });

  it('예정 예약은 정산 일정이 없어 에러', () => {
    const confirmed = visited('2026-11-15 15:00', {
      status: 'confirmed',
      visitResult: null,
      visitRecordedAt: null,
    });
    expect(() => settlementSchedule(confirmed, { hasOpenDispute: false, now })).toThrow(RangeError);
  });
});

describe('isReadyToSettle: 지급일 묶기에 들어가는지', () => {
  // 일요일 15:00 서비스, 16:00 처리 → 기한 수요일 0시. 그 주 목요일 0시에 묶는다
  const target = visited('2026-11-15 15:00');
  const deadline = kst('2026-11-18 00:00');

  it('기한이 묶는 기준 시각과 같거나 앞이면 들어가고, 조금이라도 뒤면 빠진다', () => {
    expect(
      isReadyToSettle(target, { hasOpenDispute: false, cutoff: kst('2026-11-19 00:00') }),
    ).toBe(true);
    expect(isReadyToSettle(target, { hasOpenDispute: false, cutoff: deadline })).toBe(true);
    expect(
      isReadyToSettle(target, {
        hasOpenDispute: false,
        cutoff: new Date(deadline.getTime() - 1),
      }),
    ).toBe(false);
  });

  it('확인 중 이의제기가 있으면 기한이 지나도 빠진다', () => {
    expect(isReadyToSettle(target, { hasOpenDispute: true, cutoff: kst('2026-11-19 00:00') })).toBe(
      false,
    );
  });
});
