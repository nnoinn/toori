// 방문·노쇼 처리의 실패 코드와 화면 문구 (연결 #11, #130). 화면은 error.message를 그대로 보여주고, 코드로 다음 행동을 고른다.
// 화면과 서버 어디서나 가져올 수 있다.

import { fail } from '@/lib/result';

export const VISIT_ERRORS = {
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요',
  /** 없는 예약이거나 내 샵 예약이 아님 */
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없어요',
  /** 취소된 예약 */
  NOT_RESERVED: '취소된 예약이에요',
  /** 이미 방문 완료·노쇼로 처리함. 원장님은 바꿀 수 없고 운영자가 고친다(A-104, 10/29 결정) */
  ALREADY_RECORDED: '이미 처리한 예약이에요',
  /** 서비스 시작 전(서버 시각 기준) */
  TOO_EARLY: '서비스 시작 시각이 지나야 처리할 수 있어요',
  /** 손님 취소·합의 후 취소의 환불이 진행 중(#320). 끝나면 예약이 '취소'가 된다 */
  CANCEL_IN_PROGRESS: '환불이 진행 중인 예약이에요. 잠시 뒤 다시 확인해 주세요',
} as const;

export type VisitErrorCode = keyof typeof VISIT_ERRORS;

export function visitFail(code: VisitErrorCode) {
  return fail(code, VISIT_ERRORS[code]);
}
