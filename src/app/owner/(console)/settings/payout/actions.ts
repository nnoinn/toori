'use server';

// 매장 설정 > 정산 계좌 저장 (O7 ②, S-107). 화면(payout-form.tsx)에서 부른다.
// 저장은 강규민님 changePayoutAccount가 한다(#295): 계좌번호를 암호화해 저장하고, 은행이나 번호가 바뀌었으면
// 같은 트랜잭션에서 변경 기록(은행·뒷자리)을 남긴 뒤 원장님에게 "정산 계좌가 바뀌었어요" 알림을 보낸다.
// 여기서는 그 전에 권한(내 샵인지)과 입력을 확인한다. 계좌번호는 로그·오류 문구에 넣지 않는다.

import { refresh } from 'next/cache';

import { getDb } from '@/db';
import type { ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { changePayoutAccount } from '@/server/payouts/change-account';

import { type PayoutInput, validatePayoutInput } from '../../../business-fields';

export type PayoutFieldErrors = Partial<Record<keyof PayoutInput, string>>;

export type SavePayoutResponse =
  { ok: true } | { ok: false; error: ResultError & { fieldErrors?: PayoutFieldErrors } };

/** 정산 계좌를 바꾼다(없으면 등록한다, #213). 다음 정산부터 새 계좌로 보낸다 */
export async function savePayoutAccount(
  shopId: string,
  input: PayoutInput,
): Promise<SavePayoutResponse> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;

  const checked = validatePayoutInput(input);
  if (!checked.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_INPUT',
        message: '입력한 내용을 다시 확인해 주세요',
        fieldErrors: checked.fieldErrors,
      },
    };
  }
  const { bankCode, accountNumber, accountHolder } = checked.data;
  // 계좌번호는 숫자만(validatePayoutInput이 맞춘 값). 바뀐 사람은 로그인한 사용자다
  await changePayoutAccount(getDb(), {
    shopId,
    changedBy: auth.data.userId,
    bankCode,
    accountNumber,
    accountHolder,
  });

  refresh();
  return { ok: true };
}
