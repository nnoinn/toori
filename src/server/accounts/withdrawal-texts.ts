// 회원 탈퇴 막는 이유의 화면 문구 (#154). 고객 [회원 탈퇴](정찬형)와 원장님 [원장님 탈퇴](정민석)가 같이 쓴다.
// 화면과 서버 어디서나 가져올 수 있다. 문구는 여기 한 곳에서만 고친다

import { formatWon } from '@/lib/format';
import { HOLD_MINUTES } from '@/server/policy/slot-time';

import type { WithdrawalBlocker } from './withdrawal-types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 한국 날짜 'YYYY-MM-DD' → "11/26(목)" */
function formatDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${month}/${day}(${WEEKDAYS[weekday]})`;
}

/** 막는 이유 한 줄. account는 누구의 탈퇴인지(같은 이유라도 할 일이 다르다) */
export function withdrawalBlockerText(
  blocker: WithdrawalBlocker,
  account: 'customer' | 'owner',
): string {
  switch (blocker.code) {
    case 'UPCOMING_RESERVATION':
      return account === 'customer'
        ? `이용 예정인 예약이 ${blocker.count}건 있어요. 이용하거나 취소한 뒤 탈퇴할 수 있어요`
        : `손님이 예약한 매물이 ${blocker.count}건 있어요. 서비스가 끝난 뒤 탈퇴할 수 있어요`;
    case 'HELD_BY_CUSTOMER':
      return `손님이 결제 중인 매물이 ${blocker.count}건 있어요. 결제가 끝나거나 ${HOLD_MINUTES}분이 지난 뒤 다시 확인해 주세요`;
    case 'VISIT_PENDING':
      return account === 'customer'
        ? `방문 확인 중인 예약이 ${blocker.count}건 있어요. 원장님이 방문을 확인한 뒤 탈퇴할 수 있어요`
        : `방문·노쇼 처리를 하지 않은 예약이 ${blocker.count}건 있어요. 처리한 뒤 탈퇴할 수 있어요`;
    case 'UNPAID_SETTLEMENT':
      return blocker.nextPayoutDate
        ? `아직 지급하지 않은 정산금이 있어요. ${formatDay(blocker.nextPayoutDate)} 지급 뒤 탈퇴할 수 있어요`
        : '아직 지급하지 않은 정산금이 있어요. 지급이 끝난 뒤 탈퇴할 수 있어요';
    case 'UNPAID_PENALTY':
      return `아직 정산에서 떼지 못한 패널티 ${formatWon(blocker.amount)}이 있어요. 다음 정산에서 모두 뗀 뒤 탈퇴할 수 있어요`;
    case 'OPEN_DISPUTE':
      return `확인 중인 이의제기가 ${blocker.count}건 있어요. 결론이 난 뒤 탈퇴할 수 있어요`;
  }
}
