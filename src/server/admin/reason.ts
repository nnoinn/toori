// 운영자 처리 사유 확인 (#373 공통 규칙: 모든 처리는 사유가 필수). 서버와 화면이 같은 기준을 쓴다.
// 사유는 앞뒤 공백을 뺀 값으로 운영자 처리 기록(admin_actions.memo)에 남는다.

import { ADMIN_REASON_LIMIT } from '@/server/policy/admin';

export type AdminReasonProblem = 'REASON_REQUIRED' | 'REASON_TOO_LONG';

/** 사유 확인. 글자가 아니거나 빈칸(공백만 포함)이면 REASON_REQUIRED, 상한을 넘으면 REASON_TOO_LONG */
export function toAdminReason(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; problem: AdminReasonProblem } {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (reason === '') return { ok: false, problem: 'REASON_REQUIRED' };
  if (reason.length > ADMIN_REASON_LIMIT) return { ok: false, problem: 'REASON_TOO_LONG' };
  return { ok: true, reason };
}
