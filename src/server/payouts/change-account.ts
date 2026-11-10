// 정산 계좌 바꾸기 (#295, W16 ③, 11/1·11/10 결정). 원장님 매장 설정 > 정산 계좌 저장(정민석 savePayoutAccount)이 부른다.
// 서버에서만 부른다('use server'가 아니다). 권한 확인(requireShopOwner)과 입력 검사(validatePayoutInput)는 부른 쪽이 먼저 한다.
// 계좌가 바뀌면 같은 트랜잭션에서 변경 기록(은행·뒷자리)을 남기고, 응답을 보낸 뒤 원장님에게 알림을 보낸다.
// 가입 때 처음 등록하는 계좌(createOwnerAccount)는 이 함수를 쓰지 않는다(변경이 아니라서 기록하지 않는다).
// 계좌번호는 로그·오류 문구에 넣지 않는다.

import 'server-only';

import type { getDb } from '@/db';
import { notifyPayoutAccountChanged } from '@/server/notifications/alerts';
import type { BankCode } from '@/server/policy';

import { decryptAccountNumber, encryptAccountNumber } from './account-crypto';
import {
  type CurrentPayoutAccount,
  insertPayoutAccountChange,
  lockPayoutAccount,
  writePayoutAccount,
} from './change-account-store';

type Db = ReturnType<typeof getDb>;

export type ChangePayoutAccountInput = {
  shopId: string;
  /** 바꾼 사람(로그인한 사용자 id) */
  changedBy: string;
  bankCode: BankCode;
  /** 숫자만 */
  accountNumber: string;
  accountHolder: string;
};

/** 은행과 계좌번호가 지금 계좌와 같은지. 암호문은 저장할 때마다 달라서 지금 번호를 풀어서 비교한다 */
function isSameAccount(
  current: CurrentPayoutAccount,
  input: Pick<ChangePayoutAccountInput, 'bankCode' | 'accountNumber'>,
): boolean {
  if (current.bankCode !== input.bankCode) return false;
  try {
    return decryptAccountNumber(current.accountNumberEncrypted) === input.accountNumber;
  } catch (error) {
    // 지금 암호문을 풀지 못하면 같은지 알 수 없으니 바뀐 것으로 보고 기록·알림을 남긴다
    console.error(
      '[payout] 지금 계좌를 풀지 못해 바뀐 것으로 기록해요:',
      error instanceof Error ? error.name : 'unknown',
    );
    return false;
  }
}

/**
 * 정산 계좌를 저장한다. 계좌가 없으면 새로 등록한다(#213).
 * 은행이나 번호가 바뀌었거나 처음 등록하면 changed: true(변경 기록 + 알림). 같은 계좌면(예금주만 고친 경우 포함) 저장만 하고 false
 */
export async function changePayoutAccount(
  db: Db,
  input: ChangePayoutAccountInput,
): Promise<{ changed: boolean }> {
  const accountLast4 = input.accountNumber.slice(-4);
  const accountNumberEncrypted = encryptAccountNumber(input.accountNumber);

  const changeId = await db.transaction(async (tx): Promise<string | null> => {
    const current = await lockPayoutAccount(tx, input.shopId);
    const same = current !== null && isSameAccount(current, input);
    await writePayoutAccount(tx, input.shopId, {
      bankCode: input.bankCode,
      accountNumberEncrypted,
      accountLast4,
      accountHolder: input.accountHolder,
    });
    if (same) return null;
    return insertPayoutAccountChange(tx, {
      shopId: input.shopId,
      changedBy: input.changedBy,
      previousBankCode: current?.bankCode ?? null,
      previousAccountLast4: current?.accountLast4 ?? null,
      bankCode: input.bankCode,
      accountLast4,
    });
  });

  if (changeId === null) return { changed: false };
  notifyPayoutAccountChanged(db, { shopId: input.shopId, changeId });
  return { changed: true };
}
