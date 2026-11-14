// 가입 '시작하기'로 보낼 값 만들기 (C-104, J8). 화면 없이 테스트한다.
// 이름은 예약자 이름이라 가입 때 받는다(#375, 11/13 nnoinn). 확인 규칙은 서버와 같은 customerNameSchema(앞뒤 공백 빼고 1~30자).
// 휴대폰 번호는 문자 인증 없이 모양만 본다(11/2, #183). 서버(createCustomerAccount)도 같은 규칙으로 다시 확인한다.

import { normalizePhone } from '@/lib/phone';
import { customerNameSchema } from '@/server/auth/customer-name';
import type { createCustomerAccount } from '@/server/auth/customer-account';

import { toAgreementsInput, type AgreementState } from './agreements';

export type JoinRequest = Parameters<typeof createCustomerAccount>[0] & { name: string };

/** 필수 동의·이름·휴대폰 번호가 모두 맞으면 보낼 값, 하나라도 빠지거나 틀리면 null('시작하기'를 누를 수 없다) */
export function buildJoinRequest(input: {
  agreements: AgreementState;
  name: string;
  phone: string;
  next: string;
}): JoinRequest | null {
  const agreements = toAgreementsInput(input.agreements);
  const name = customerNameSchema.safeParse(input.name);
  const phone = normalizePhone(input.phone, 'mobile');
  if (!agreements || !name.success || !phone) return null;
  return { agreements, name: name.data, phone, next: input.next };
}
