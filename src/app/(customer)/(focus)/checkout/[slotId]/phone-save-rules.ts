// 예약 확인 화면 연락처 자동 저장 규칙 (J10, C-401, #183). 화면 없이 테스트한다.
// 주문은 입력칸 값이 아니라 저장된 customers.phone을 읽는다(checkout-store). 그래서 칸에 보이는 번호가
// 저장된 번호와 같고 저장이 끝났을 때만 결제할 수 있다. 화면과 다른 예전 번호로 결제되지 않게.

import { normalizePhone } from '@/lib/phone';

export type PhoneSubmit = { kind: 'save'; phone: string } | { kind: 'invalid' } | { kind: 'none' };

/**
 * 번호를 끝까지 쳤거나 칸을 벗어났을 때 할 일. 빈 칸은 그대로 둔다.
 * 저장 중이면 저장 중인 번호와, 아니면 저장된 번호와 같을 때만 다시 저장하지 않는다.
 * (저장하는 사이에 원래 번호로 되돌렸으면 그 번호를 다시 저장해야 마지막 입력이 남는다)
 */
export function phoneSubmit(
  value: string,
  saved: string | null,
  saving: string | null,
): PhoneSubmit {
  if (value.trim() === '') return { kind: 'none' };
  const phone = normalizePhone(value, 'mobile');
  if (!phone) return { kind: 'invalid' };
  if (phone === (saving ?? saved)) return { kind: 'none' };
  return { kind: 'save', phone };
}

/** 결제할 수 있는 연락처인지: 저장 중이 아니고, 칸에 보이는 번호가 저장된 번호와 같다 */
export function isPhoneReady(value: string, saved: string | null, saving: string | null): boolean {
  return saving === null && saved !== null && normalizePhone(value, 'mobile') === saved;
}
