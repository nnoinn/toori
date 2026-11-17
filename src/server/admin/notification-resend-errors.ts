// 운영자 알림 다시 보내기(#373 ⑤)의 실패 코드와 화면 문구. 화면은 error.message를 그대로 보여준다.
// 화면과 서버 어디서나 가져올 수 있다.

import type { ResultError } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

export const NOTIFICATION_RESEND_ERRORS = {
  /** 사유가 빈칸(공백만 포함) */
  REASON_REQUIRED: '사유를 적어 주세요',
  /** 사유가 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  REASON_TOO_LONG: `사유는 ${ADMIN_REASON_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
  /** 없는 알림(알림함 기간이 지나 지워졌을 수 있다) */
  NOTIFICATION_NOT_FOUND: '알림을 찾을 수 없어요. 화면을 새로 고쳐 주세요',
  /** 이미 보낸 알림(다른 운영자가 먼저 다시 보냈거나 처음부터 보냈음) */
  ALREADY_SENT: '이미 보낸 알림이에요. 화면을 새로 고쳐 주세요',
  /** 받는 계정에 푸시 알림을 켠 기기가 아직 없음 */
  NO_DEVICE: '이 계정은 아직 푸시 알림을 켠 기기가 없어요. 알림함에는 남아 있어요',
} as const;

export type NotificationResendErrorCode = keyof typeof NOTIFICATION_RESEND_ERRORS;

export type NotificationResendResult<T> = { ok: true; data: T } | { ok: false; error: ResultError };

export function notificationResendFail(code: NotificationResendErrorCode): {
  ok: false;
  error: ResultError;
} {
  return { ok: false, error: { code, message: NOTIFICATION_RESEND_ERRORS[code] } };
}
