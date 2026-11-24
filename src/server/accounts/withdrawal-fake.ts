// 회원 탈퇴 화면 확인용 스위치 (#154). 서버에서만 부른다. 로컬 개발(NODE_ENV=development)에서만 켜지고,
// 배포 주소·테스트에서는 꺼져 있다. 탈퇴·되살리기는 진짜로 저장하고, 이 스위치는 막힌 화면만 흉내 낸다.
//
// - DEV_FAKE_WITHDRAWAL=blocked: 탈퇴 확인이 막는 이유를 그 계정 종류의 것 모두로 주고, 탈퇴 처리가 WITHDRAWAL_BLOCKED로 막힌다
//   (막힌 이유를 모두 보여 주는 화면 확인용. 진짜 데이터로 만들기 어려운 미지급 정산금·미수 패널티까지 보인다)

import 'server-only';

import type { WithdrawalBlocker } from './withdrawal-types';

export type FakeWithdrawalMode = 'blocked';

/** 켠 가짜 모드. 꺼져 있거나 로컬 개발이 아니면 null */
export function fakeWithdrawalMode(): FakeWithdrawalMode | null {
  if (process.env.NODE_ENV !== 'development') return null;
  return process.env.DEV_FAKE_WITHDRAWAL === 'blocked' ? 'blocked' : null;
}

/** blocked 모드에서 고객 탈퇴 확인이 주는 막는 이유(고객에게 해당하는 것 모두) */
export const FAKE_CUSTOMER_BLOCKERS: WithdrawalBlocker[] = [
  { code: 'UPCOMING_RESERVATION', count: 2 },
  { code: 'VISIT_PENDING', count: 1 },
  { code: 'OPEN_DISPUTE', count: 1 },
];

/** blocked 모드에서 원장님 탈퇴 확인이 주는 막는 이유(원장님에게 해당하는 것 모두). 지급일은 예시 날짜 */
export const FAKE_OWNER_BLOCKERS: WithdrawalBlocker[] = [
  { code: 'UPCOMING_RESERVATION', count: 3 },
  { code: 'HELD_BY_CUSTOMER', count: 1 },
  { code: 'VISIT_PENDING', count: 1 },
  { code: 'OPEN_DISPUTE', count: 1 },
  { code: 'UNPAID_SETTLEMENT', nextPayoutDate: '2026-11-26' },
  { code: 'UNPAID_PENALTY', amount: 5000 },
];
