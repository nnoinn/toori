// 회원 탈퇴 막는 이유의 화면 문구 (#154). 고객·원장님 화면이 같이 쓴다

import { describe, expect, it } from 'vitest';

import { withdrawalBlockerText } from './withdrawal-texts';

describe('탈퇴를 막는 이유 문구', () => {
  it('이용 예정 예약·방문 확인 중은 고객과 원장님의 할 일이 다르다', () => {
    const upcoming = { code: 'UPCOMING_RESERVATION', count: 2 } as const;
    expect(withdrawalBlockerText(upcoming, 'customer')).toBe(
      '이용 예정인 예약이 2건 있어요. 이용하거나 취소한 뒤 탈퇴할 수 있어요',
    );
    expect(withdrawalBlockerText(upcoming, 'owner')).toBe(
      '손님이 예약한 매물이 2건 있어요. 서비스가 끝난 뒤 탈퇴할 수 있어요',
    );
    const pending = { code: 'VISIT_PENDING', count: 1 } as const;
    expect(withdrawalBlockerText(pending, 'customer')).toBe(
      '방문 확인 중인 예약이 1건 있어요. 원장님이 방문을 확인한 뒤 탈퇴할 수 있어요',
    );
    expect(withdrawalBlockerText(pending, 'owner')).toBe(
      '방문·노쇼 처리를 하지 않은 예약이 1건 있어요. 처리한 뒤 탈퇴할 수 있어요',
    );
  });

  it('손님 결제 중은 홀딩 시간(10분)을 알려 준다', () => {
    expect(withdrawalBlockerText({ code: 'HELD_BY_CUSTOMER', count: 1 }, 'owner')).toBe(
      '손님이 결제 중인 매물이 1건 있어요. 결제가 끝나거나 10분이 지난 뒤 다시 확인해 주세요',
    );
  });

  it('미지급 정산금은 지급일을 요일과 함께, 지급일이 없으면 지급이 끝난 뒤', () => {
    expect(
      withdrawalBlockerText({ code: 'UNPAID_SETTLEMENT', nextPayoutDate: '2026-11-26' }, 'owner'),
    ).toBe('아직 지급하지 않은 정산금이 있어요. 11/26(목) 지급 뒤 탈퇴할 수 있어요');
    expect(
      withdrawalBlockerText({ code: 'UNPAID_SETTLEMENT', nextPayoutDate: null }, 'owner'),
    ).toBe('아직 지급하지 않은 정산금이 있어요. 지급이 끝난 뒤 탈퇴할 수 있어요');
  });

  it('미수 패널티는 금액을, 이의제기는 건수를 보여 준다', () => {
    expect(withdrawalBlockerText({ code: 'UNPAID_PENALTY', amount: 5000 }, 'owner')).toBe(
      '아직 정산에서 떼지 못한 패널티 5,000원이 있어요. 다음 정산에서 모두 뗀 뒤 탈퇴할 수 있어요',
    );
    expect(withdrawalBlockerText({ code: 'OPEN_DISPUTE', count: 2 }, 'customer')).toBe(
      '확인 중인 이의제기가 2건 있어요. 결론이 난 뒤 탈퇴할 수 있어요',
    );
  });
});
