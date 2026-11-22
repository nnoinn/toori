// 운영자 정산 보류·풀기(#373 ②)의 실패 코드와 화면 문구. 화면과 서버 어디서나 가져올 수 있다.

import { fail } from '@/lib/result';
import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

export const SETTLEMENT_HOLD_ERRORS = {
  INVALID_INPUT: '입력한 내용을 다시 확인해 주세요',
  RESERVATION_NOT_FOUND: '예약을 찾을 수 없어요',
  SHOP_NOT_FOUND: '샵을 찾을 수 없어요',
  HOLD_NOT_FOUND: '정산 보류를 찾을 수 없어요',
  /** 사유(보류)·메모(풀기)가 빈칸(공백만 포함) */
  REASON_REQUIRED: '사유를 적어 주세요',
  /** 원장님에게 보여 줄 사유를 목록에서 고르지 않았거나 정산 보류에 없는 사유(#489) */
  CODE_REQUIRED: '원장님에게 보여 줄 사유를 골라 주세요',
  /** 사유가 상한을 넘음(화면은 그 전에 입력을 멈춘다) */
  REASON_TOO_LONG: `사유는 ${ADMIN_REASON_LIMIT.toLocaleString('ko-KR')}자까지 쓸 수 있어요`,
  /** 원장님 사정 취소·자동 취소·운영자 취소처럼 정산 줄이 생기지 않는 예약 */
  NOTHING_TO_SETTLE: '정산할 금액이 없는 예약이라 보류할 것이 없어요',
  /** 이미 목요일 정산에 묶임. 묶인 정산은 지급 요청 전 확인(A-105)에서 막는다(11/15 nnoinn) */
  ALREADY_BUNDLED: '이미 정산에 묶인 예약이에요. 묶인 정산은 지급 요청 전에 확인해요',
  /** 같은 거래·같은 샵에 풀리지 않은 보류가 있음 */
  ALREADY_HELD: '이미 정산 보류 중이에요',
  /** 이미 풀린 보류 */
  ALREADY_RELEASED: '이미 풀린 정산 보류예요',
} as const;

export type SettlementHoldErrorCode = keyof typeof SETTLEMENT_HOLD_ERRORS;

export function settlementHoldFail(code: SettlementHoldErrorCode) {
  return fail(code, SETTLEMENT_HOLD_ERRORS[code]);
}
