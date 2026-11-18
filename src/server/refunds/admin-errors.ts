// 운영자가 대신 하는 원장님 사정 취소(#373 ③-2)의 실패 코드와 화면 문구. 원장님 취소와 같은 실패는 같은 코드·문구(REFUND_ERRORS)다.
// 화면과 서버 어디서나 가져올 수 있다.

import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

import { REFUND_ERRORS, type RefundError } from './errors';

export const ADMIN_OWNER_FAULT_ERRORS = {
  ...REFUND_ERRORS,
  /** 사유가 빈칸(공백만 포함) */
  REASON_REQUIRED: '사유를 적어 주세요',
  /** 사유가 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  REASON_TOO_LONG: `사유는 ${ADMIN_REASON_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
} as const;

export type AdminOwnerFaultErrorCode = keyof typeof ADMIN_OWNER_FAULT_ERRORS;

export function adminOwnerFaultFail(code: AdminOwnerFaultErrorCode): {
  ok: false;
  error: RefundError;
} {
  return { ok: false, error: { code, message: ADMIN_OWNER_FAULT_ERRORS[code] } };
}
