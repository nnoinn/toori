// 회원 탈퇴 가짜 결과 버전의 스위치 (#154). 서버에서만 부른다. 로컬 개발(NODE_ENV=development)에서만 켜지고,
// 배포 주소·테스트에서는 꺼져 있다. 진짜 버전(DB 구조 0023 승인 뒤)에서 이 파일을 지운다.
//
// - DEV_FAKE_WITHDRAWAL=on: 탈퇴·되살리기가 저장하지 않고 성공 모양을 돌려주고, getRestorableAccount가 "3일 전에 탈퇴한 계정"을 준다
// - DEV_FAKE_WITHDRAWAL=blocked: 탈퇴 확인이 막는 이유를 그 계정 종류의 것 모두로 주고, 탈퇴 처리가 WITHDRAWAL_BLOCKED로 막힌다
//   (막힌 이유를 모두 보여 주는 화면 확인용. 진짜 데이터로 만들기 어려운 미지급 정산금·미수 패널티까지 보인다)
// - DEV_FAKE_WITHDRAWAL_FAILURE=<함수>:<코드>: 그 함수가 그 실패를 돌려준다. 예: restoreCustomer:RESTORE_EXPIRED

import 'server-only';

import { type WithdrawalErrorCode, withdrawalFail } from './withdrawal-errors';
import type { WithdrawalBlocker } from './withdrawal-types';

export type FakeWithdrawalMode = 'on' | 'blocked';

/** 켠 가짜 모드. 꺼져 있거나 로컬 개발이 아니면 null */
export function fakeWithdrawalMode(): FakeWithdrawalMode | null {
  const value = process.env.DEV_FAKE_WITHDRAWAL;
  return value === 'on' || value === 'blocked' ? value : null;
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

/** on 모드에서 getRestorableAccount가 보여 주는 탈퇴 시각(지금부터 며칠 전) */
export const FAKE_WITHDRAWN_DAYS_AGO = 3;

const SWITCHABLE = {
  withdrawCustomer: ['NOT_OPEN'],
  withdrawOwner: ['NOT_OPEN'],
  restoreCustomer: ['NOT_WITHDRAWN', 'RESTORE_EXPIRED', 'NOT_OPEN'],
  restoreOwner: ['NOT_WITHDRAWN', 'RESTORE_EXPIRED', 'NOT_OPEN'],
} as const satisfies Record<string, readonly WithdrawalErrorCode[]>;

/** DEV_FAKE_WITHDRAWAL_FAILURE가 이 함수를 가리키면 그 실패, 아니면 null */
export function fakeWithdrawalFailure(fn: keyof typeof SWITCHABLE) {
  if (process.env.NODE_ENV !== 'development') return null;
  const [target, code = ''] = (process.env.DEV_FAKE_WITHDRAWAL_FAILURE ?? '').split(':');
  if (target !== fn) return null;
  const allowed: readonly string[] = SWITCHABLE[fn];
  if (!allowed.includes(code)) {
    console.warn(`[withdrawal] ${fn}에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  return withdrawalFail(code as WithdrawalErrorCode);
}
