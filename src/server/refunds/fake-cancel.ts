// 예약 취소 가짜 결과 버전에서만 쓰는 실패 흉내 스위치. 서버에서만 부른다. W14에서 지운다.
// 결제 함수와 같은 값을 쓴다: 로컬(npm run dev)의 .env.local에 DEV_FAKE_PAYMENT_FAILURE=cancelReservation:<코드>
// 예: DEV_FAKE_PAYMENT_FAILURE=cancelReservation:REFUND_FAILED. 배포 주소와 테스트에서는 꺼져 있다

import 'server-only';

import { type RefundError, refundFail } from './errors';
import type { RefundPreview } from './types';

const SWITCHABLE = [
  'ALREADY_CANCELLED',
  'NOT_REFUNDABLE',
  'REFUND_CHANGED',
  'REFUND_FAILED',
] as const;

/** 스위치가 cancelReservation을 가리키면 그 실패, 아니면 null. REFUND_CHANGED에는 지금 미리보기를 붙인다 */
export function devFakeCancelFailure(
  preview: RefundPreview,
): { ok: false; error: RefundError } | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const [target, code] = (process.env.DEV_FAKE_PAYMENT_FAILURE ?? '').split(':');
  if (target !== 'cancelReservation') return null;
  const switchable = SWITCHABLE.find((value) => value === code);
  if (!switchable) {
    console.warn(`[fake-cancel] cancelReservation에서 흉내 낼 수 없는 실패 코드예요: ${code}`);
    return null;
  }
  return switchable === 'REFUND_CHANGED'
    ? refundFail(switchable, { preview })
    : refundFail(switchable);
}
