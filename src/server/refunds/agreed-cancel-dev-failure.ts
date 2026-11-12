// 합의 후 취소 실패 화면 확인용 스위치 (#301). 서버에서만 부른다. 로컬 개발(NODE_ENV=development)에서만 켜지고 배포 주소·테스트에서는 꺼져 있다.
// .env.local에 DEV_FAKE_AGREED_CANCEL_FAILURE=<함수>:<코드>를 적으면 그 함수가 그 실패를 돌려준다(결제의 DEV_FAKE_PAYMENT_FAILURE와 같은 방식).
// 예: DEV_FAKE_AGREED_CANCEL_FAILURE=respondAgreedCancel:REFUND_FAILED. 진짜 데이터로 만들기 어려운 실패(환불 실패 등) 화면을 볼 때 쓴다

import 'server-only';

import { type AgreedCancelErrorCode, agreedCancelFail } from './agreed-cancel-errors';

const SWITCHABLE = {
  requestAgreedCancel: ['RESERVATION_NOT_FOUND', 'NOT_REQUESTABLE', 'ALREADY_REQUESTED'],
  respondAgreedCancel: [
    'REQUEST_NOT_FOUND',
    'REQUEST_EXPIRED',
    'ALREADY_RESPONDED',
    'RESERVATION_CHANGED',
    'REFUND_FAILED',
    'CANCEL_FINISHING',
  ],
} as const satisfies Record<string, readonly AgreedCancelErrorCode[]>;

/** DEV_FAKE_AGREED_CANCEL_FAILURE가 이 함수를 가리키면 그 실패, 아니면 null */
export function devAgreedCancelFailure(fn: keyof typeof SWITCHABLE) {
  if (process.env.NODE_ENV !== 'development') return null;
  const [target, code = ''] = (process.env.DEV_FAKE_AGREED_CANCEL_FAILURE ?? '').split(':');
  if (target !== fn) return null;
  const allowed: readonly string[] = SWITCHABLE[fn];
  if (!allowed.includes(code)) {
    console.warn(`[agreed-cancel] ${fn}에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  return agreedCancelFail(code as AgreedCancelErrorCode);
}
