// 운영자가 원장님 대신 하는 방문·노쇼 처리와 노쇼 되돌리기(#373 ③)의 실패 코드와 화면 문구.
// 원장님 처리와 같은 실패는 같은 코드·문구를 쓴다(VISIT_ERRORS). 화면과 서버 어디서나 가져올 수 있다.

import { fail } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

import { VISIT_ERRORS } from './errors';

export const ADMIN_VISIT_ERRORS = {
  ...VISIT_ERRORS,
  /** 사유가 빈칸(공백만 포함) */
  REASON_REQUIRED: '사유를 적어 주세요',
  /** 사유가 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  REASON_TOO_LONG: `사유는 ${ADMIN_REASON_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
  /** 노쇼 되돌리기: 노쇼로 처리된 예약이 아님 */
  NOT_NO_SHOW: '노쇼로 처리된 예약이 아니에요',
  /** 노쇼 되돌리기: 확인 중인 이의제기가 있음. 같은 일을 두 곳에서 하지 않게 이의제기 결론으로 한다 */
  DISPUTE_OPEN: '확인 중인 이의제기가 있는 예약이에요. 이의제기 결론(노쇼 취소)으로 처리해 주세요',
  /** 노쇼 되돌리기: 이미 정산에 묶임(11/16 결정, 묶이기 전까지만) */
  SETTLEMENT_BUNDLED: '이미 정산에 묶인 예약이라 되돌릴 수 없어요',
} as const;

export type AdminVisitErrorCode = keyof typeof ADMIN_VISIT_ERRORS;

export function adminVisitFail(code: AdminVisitErrorCode) {
  return fail(code, ADMIN_VISIT_ERRORS[code]);
}
