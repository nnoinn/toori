'use server';

// 매장 설정 > 사업자 정보 저장 (O7 ②, S-101·S-102, #23 D19). 화면(business-info-form.tsx)에서 부른다.
// 승인 대기·반려일 때만 고칠 수 있다. 반려면 고친 뒤 다시 신청(반려 → 승인 대기)까지 한 트랜잭션으로 한다(#50, 강규민님 resubmitShop).

import { TransactionRollbackError } from 'drizzle-orm';
import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, type ResultError } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { SHOP_REVIEW_ERRORS } from '@/server/shops';
import { resubmitShop } from '@/server/shops/review-store';
import { assertBusinessDocPath } from '@/server/storage';

import { type BusinessInput, kstDateKey, validateBusinessInput } from '../../../business-fields';
import { selectBusinessInfo, updateBusinessInfo } from './business-info-store';

export type BusinessFieldErrors = Partial<Record<keyof BusinessInput, string>>;

export type SaveBusinessInfoResponse =
  { ok: true } | { ok: false; error: ResultError & { fieldErrors?: BusinessFieldErrors } };

const LOCKED = {
  code: 'BUSINESS_INFO_LOCKED',
  message:
    '입점 승인 뒤에는 사업자 정보를 고칠 수 없어요. 변경은 투리 카카오톡 채널로 문의해 주세요',
};

/**
 * 사업자 정보를 저장한다. options.resubmit이면(반려 상태) 저장한 뒤 다시 신청해서 승인 대기로 돌린다.
 * 등록증 경로가 바뀌었으면 createBusinessDocUploadUrl({ shopId })로 올린 그 샵 폴더의 것인지 확인한다
 */
export async function saveBusinessInfo(
  shopId: string,
  input: BusinessInput,
  options: { resubmit?: boolean } = {},
): Promise<SaveBusinessInfoResponse> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;

  const checked = validateBusinessInput(input, kstDateKey(await getRequestNow()));
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

  const db = getDb();
  const current = await selectBusinessInfo(db, shopId);
  if (!current) return fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);
  if (checked.data.businessDocPath !== current.businessDocPath) {
    const docPath = await assertBusinessDocPath({ shopId }, checked.data.businessDocPath);
    if (!docPath.ok) {
      return {
        ok: false,
        error: { ...docPath.error, fieldErrors: { businessDocPath: docPath.error.message } },
      };
    }
  }

  // 실패하면 tx.rollback()으로 사업자 정보 저장까지 되돌리고, 이유는 failure에 남긴다
  let failure = null as ResultError | null;
  try {
    await db.transaction(async (tx) => {
      if (!(await updateBusinessInfo(tx, shopId, checked.data))) {
        failure = LOCKED;
        tx.rollback();
        return;
      }
      if (options.resubmit) {
        const resubmitted = await resubmitShop(tx, shopId);
        if (!resubmitted.ok) {
          failure = resubmitted.error;
          tx.rollback();
        }
      }
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
  if (failure) return { ok: false, error: failure };

  refresh();
  return { ok: true };
}
