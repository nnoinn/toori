// 이의제기 실패 화면 확인용 스위치 (#299). 서버에서만 부른다. 로컬 개발(NODE_ENV=development)에서만 켜지고 배포 주소와 테스트에서는 꺼져 있다.
// .env.local에 DEV_FAKE_DISPUTE_FAILURE=submitDispute:<코드>를 적으면 접수가 그 실패를 돌려준다(결제의 DEV_FAKE_PAYMENT_FAILURE와 같은 방식).
// 예: DEV_FAKE_DISPUTE_FAILURE=submitDispute:DEADLINE_PASSED

import 'server-only';

import { type DisputeError, disputeFail } from './errors';

const SWITCHABLE = {
  submitDispute: ['RESERVATION_NOT_FOUND', 'NOT_OPEN_YET', 'DEADLINE_PASSED', 'ALREADY_SUBMITTED'],
} as const satisfies Record<string, readonly string[]>;

/** DEV_FAKE_DISPUTE_FAILURE가 이 함수를 가리키면 그 실패, 아니면 null. DEADLINE_PASSED의 기한은 지금 시각으로 준다 */
export function devFakeDisputeFailure(
  fn: keyof typeof SWITCHABLE,
  now: Date,
): { ok: false; error: DisputeError } | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const [target, code = ''] = (process.env.DEV_FAKE_DISPUTE_FAILURE ?? '').split(':');
  if (target !== fn) return null;
  const allowed: readonly string[] = SWITCHABLE[fn];
  if (!allowed.includes(code)) {
    console.warn(`[dev-fake-failure] ${fn}에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  const switched = code as (typeof SWITCHABLE)[typeof fn][number];
  return switched === 'DEADLINE_PASSED'
    ? disputeFail(switched, { deadline: now.toISOString() })
    : disputeFail(switched);
}
