// 합의 후 취소 가짜 결과 버전의 스위치 (#301). 서버에서만 부른다. 진짜 버전(#320 승인 → 마이그레이션 → X-208)이 오면 이 파일을 지운다.
//
// - DEV_FAKE_AGREED_CANCEL=<상태>: 요청 상태를 흉내 낸다. requested(손님 답 기다림) / agreed / declined / expired / closed.
//   비워 두면 "요청한 적 없음"이다. 로컬 개발(NODE_ENV=development)에서만 켜지고 배포 주소·테스트에서는 늘 "요청한 적 없음"
// - DEV_FAKE_AGREED_CANCEL_FAILURE=<함수>:<코드>: 그 함수가 그 실패를 돌려준다(결제의 DEV_FAKE_PAYMENT_FAILURE와 같은 방식).
//   예: DEV_FAKE_AGREED_CANCEL_FAILURE=respondAgreedCancel:REQUEST_EXPIRED
// 가짜 버전에서는 요청 id가 예약 id와 같다(화면은 받은 requestId를 그대로 넘기면 된다)

import 'server-only';

import { AGREED_CANCEL_RESPONSE_HOURS } from '@/server/policy/refund';

import { type AgreedCancelErrorCode, agreedCancelFail } from './agreed-cancel-errors';
import {
  AGREED_CANCEL_STATUSES,
  type AgreedCancelRequestInfo,
  type AgreedCancelStatus,
} from './agreed-cancel-types';

const HOUR_MS = 60 * 60 * 1000;

/** 지금 흉내 내는 요청 상태. 꺼져 있으면 none */
export function fakeAgreedCancelStatus(): AgreedCancelStatus {
  if (process.env.NODE_ENV !== 'development') return 'none';
  const value = process.env.DEV_FAKE_AGREED_CANCEL ?? '';
  if (value === '') return 'none';
  if (!(AGREED_CANCEL_STATUSES as readonly string[]).includes(value)) {
    console.warn(`[agreed-cancel] DEV_FAKE_AGREED_CANCEL에 모르는 상태예요: ${value}`);
    return 'none';
  }
  return value as AgreedCancelStatus;
}

/** 흉내 내는 상태의 요청 한 건(사유는 "원하는 시술이 달라요"). none이면 null */
export function fakeAgreedCancelRequest(
  reservationId: string,
  status: AgreedCancelStatus,
  now: Date,
): AgreedCancelRequestInfo | null {
  if (status === 'none') return null;
  // 기한이 지난 요청은 하루 전쯤, 나머지는 한 시간 전에 보낸 것으로 둔다
  const requestedAt = new Date(
    now.getTime() - (status === 'expired' ? AGREED_CANCEL_RESPONSE_HOURS + 1 : 1) * HOUR_MS,
  );
  const expiresAt = new Date(requestedAt.getTime() + AGREED_CANCEL_RESPONSE_HOURS * HOUR_MS);
  return {
    requestId: reservationId,
    reason: 'style_mismatch',
    reasonText: null,
    requestedAt: requestedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    respondedAt:
      status === 'requested'
        ? null
        : status === 'expired'
          ? expiresAt.toISOString()
          : new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
  };
}

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
export function fakeAgreedCancelFailure(fn: keyof typeof SWITCHABLE) {
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
