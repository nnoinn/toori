// 이의제기 접수 규칙 (#299, 11/10 결정 Q1~Q3, 11/13 내용 기준). 받기 시작·기한·고를 수 있는 종류·화면 칸·내용을 본다.

import { describe, expect, it } from 'vitest';

import { kstToUtc } from '@/lib/time';

import {
  disputeBlockReason,
  disputeContentProblem,
  disputeDeadline,
  disputeOpensAt,
  disputeState,
  type DisputeTarget,
  disputeTypes,
} from './rules';

/** 한국 시간 'YYYY-MM-DD HH:MM' → UTC Date */
function kst(value: string): Date {
  const [date, time] = value.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return kstToUtc({ year, month, day, hour, minute });
}

// 수요일 18:00 시작
const START = kst('2026-11-11 18:00');

const confirmed: DisputeTarget = {
  status: 'confirmed',
  startAt: START,
  visitResult: null,
  visitRecordedAt: null,
  cancelledAt: null,
};
const visited: DisputeTarget = {
  ...confirmed,
  status: 'completed',
  visitResult: 'visited',
  visitRecordedAt: kst('2026-11-11 19:00'),
};
const noShow: DisputeTarget = {
  ...confirmed,
  status: 'completed',
  visitResult: 'no_show',
  visitRecordedAt: kst('2026-11-11 18:30'),
};
const cancelled: DisputeTarget = {
  ...confirmed,
  status: 'cancelled',
  cancelledAt: kst('2026-11-09 10:00'),
};

describe('disputeOpensAt (Q1)', () => {
  it('예정·이용 완료 예약은 서비스 시작, 취소된 예약은 취소된 때부터', () => {
    expect(disputeOpensAt(confirmed)).toEqual(START);
    expect(disputeOpensAt(visited)).toEqual(START);
    expect(disputeOpensAt(noShow)).toEqual(START);
    expect(disputeOpensAt(cancelled)).toEqual(kst('2026-11-09 10:00'));
  });
});

describe('disputeDeadline', () => {
  it('방문·노쇼 처리 전 예정 예약은 기한이 아직 없다', () => {
    expect(disputeDeadline(confirmed)).toBeNull();
  });

  it('처리가 시작보다 늦으면 처리 시각부터 영업일 48시간', () => {
    // 수 19:00 → 목 24 + 금 19:00
    expect(disputeDeadline(visited)).toEqual(kst('2026-11-13 19:00'));
  });

  it('노쇼를 며칠 늦게 눌러도 그때부터 센다', () => {
    const late = { ...noShow, visitRecordedAt: kst('2026-11-13 15:00') };
    // 금 15:00 → 다음 주 화 15:00
    expect(disputeDeadline(late)).toEqual(kst('2026-11-17 15:00'));
  });

  it('시작 전에 취소했으면 시작부터 센다(취소 시각과 시작 중 늦은 때)', () => {
    expect(disputeDeadline(cancelled)).toEqual(kst('2026-11-13 18:00'));
  });

  it('시작 뒤에 취소됐으면 취소 시각부터', () => {
    const afterStart = { ...cancelled, cancelledAt: kst('2026-11-12 09:00') };
    expect(disputeDeadline(afterStart)).toEqual(kst('2026-11-16 09:00'));
  });
});

describe('disputeTypes (Q2)', () => {
  it('노쇼 예약: 노쇼 이의와 환불 예외(서비스를 받지 않아서 시작 후 문제는 없다)', () => {
    expect(disputeTypes(noShow)).toEqual(['no_show', 'refund_exception']);
  });

  it('방문 완료·예정 예약: 환불 예외와 시작 후 문제', () => {
    expect(disputeTypes(visited)).toEqual(['refund_exception', 'after_start']);
    expect(disputeTypes(confirmed)).toEqual(['refund_exception', 'after_start']);
  });

  it('취소된 예약: 환불 예외만', () => {
    expect(disputeTypes(cancelled)).toEqual(['refund_exception']);
  });
});

describe('disputeState·disputeBlockReason', () => {
  it('예정 예약은 시작 전 not_open, 시작부터 open, 방문 처리 전이면 계속 open', () => {
    expect(disputeState(confirmed, false, kst('2026-11-11 17:59'))).toBe('not_open');
    expect(disputeBlockReason(confirmed, false, kst('2026-11-11 17:59'))).toBe('NOT_OPEN_YET');
    expect(disputeState(confirmed, false, START)).toBe('open');
    expect(disputeState(confirmed, false, kst('2026-11-20 12:00'))).toBe('open');
  });

  it('기한 직전까지 open, 기한 시각부터 closed', () => {
    expect(disputeState(visited, false, kst('2026-11-13 18:59'))).toBe('open');
    expect(disputeState(visited, false, kst('2026-11-13 19:00'))).toBe('closed');
    expect(disputeBlockReason(visited, false, kst('2026-11-13 19:00'))).toBe('DEADLINE_PASSED');
  });

  it('취소된 예약은 취소된 때부터 받는다(시작 전이어도)', () => {
    expect(disputeState(cancelled, false, kst('2026-11-10 09:00'))).toBe('open');
    expect(disputeState(cancelled, false, kst('2026-11-09 09:59'))).toBe('not_open');
  });

  it('이미 접수했으면 기한과 상관없이 submitted(Q3)', () => {
    expect(disputeState(visited, true, kst('2026-11-12 12:00'))).toBe('submitted');
    expect(disputeState(visited, true, kst('2026-11-30 12:00'))).toBe('submitted');
    expect(disputeBlockReason(visited, true, kst('2026-11-12 12:00'))).toBe('ALREADY_SUBMITTED');
  });

  it('접수할 수 있으면 막는 이유가 없다', () => {
    expect(disputeBlockReason(noShow, false, kst('2026-11-12 12:00'))).toBeNull();
  });
});

describe('disputeContentProblem (11/13 nnoinn, #360 2번)', () => {
  it('앞뒤 공백을 뺀 내용이 빈칸이면 DISPUTE_CONTENT_REQUIRED, 한 글자부터 받는다', () => {
    expect(disputeContentProblem('')).toBe('DISPUTE_CONTENT_REQUIRED');
    expect(disputeContentProblem(' \n\t ')).toBe('DISPUTE_CONTENT_REQUIRED');
    expect(disputeContentProblem(' 네 ')).toBeNull();
  });

  it('안전 상한 5,000자까지 받고 넘으면 DISPUTE_CONTENT_TOO_LONG(앞뒤 공백은 세지 않는다)', () => {
    expect(disputeContentProblem('가'.repeat(5000))).toBeNull();
    expect(disputeContentProblem(`   ${'가'.repeat(5000)}   `)).toBeNull();
    expect(disputeContentProblem('가'.repeat(5001))).toBe('DISPUTE_CONTENT_TOO_LONG');
  });
});
