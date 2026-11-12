// 정산 내역 함수의 실패 코드와 화면 문구 (S-501, #129). 화면은 error.message를 그대로 보여준다.
// 화면과 서버 어디서나 가져올 수 있다.

import { fail } from '@/lib/result';

export const SETTLEMENT_ERRORS = {
  /** 날짜 모양이 틀렸거나, 시작일이 끝일보다 늦거나, 1년(366일)보다 긴 기간 */
  INVALID_PERIOD: '기간을 다시 골라 주세요(최대 1년)',
} as const;

export type SettlementErrorCode = keyof typeof SETTLEMENT_ERRORS;

export function settlementFail(code: SettlementErrorCode) {
  return fail(code, SETTLEMENT_ERRORS[code]);
}
