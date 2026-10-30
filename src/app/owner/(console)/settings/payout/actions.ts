'use server';

// 매장 설정 > 정산 계좌 저장 (O7 ②, S-107). 화면(payout-form.tsx)에서 부른다.
// 계좌번호는 강규민님 encryptAccountNumber로 암호화해서 저장하고 뒷자리 4개만 따로 둔다(가입 createOwnerAccount와 같게).
// 계좌번호는 로그·오류 문구에 넣지 않는다.

import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { fail, type ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { encryptAccountNumber } from '@/server/payouts/account-crypto';

import { type PayoutInput, validatePayoutInput } from '../../../business-fields';
import { updatePayoutAccount } from './payout-store';

export type PayoutFieldErrors = Partial<Record<keyof PayoutInput, string>>;

export type SavePayoutResponse =
  { ok: true } | { ok: false; error: ResultError & { fieldErrors?: PayoutFieldErrors } };

/** 정산 계좌를 바꾼다. 다음 정산부터 새 계좌로 보낸다 */
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
  const saved = await updatePayoutAccount(getDb(), shopId, {
    bankCode,
    accountNumberEncrypted: encryptAccountNumber(accountNumber),
    accountLast4: accountNumber.slice(-4),
    accountHolder,
  });
  if (!saved) return fail('PAYOUT_ACCOUNT_NOT_FOUND', '정산 계좌를 찾을 수 없어요');

  refresh();
  return { ok: true };
}
