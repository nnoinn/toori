'use server';

// 운영자: 승인된 샵의 사업자 정보 수정 (#50 4장, W18). 운영자 샵 상세의 [사업자 정보 수정] 창이 부른다.
// 승인 뒤에는 원장님이 사업자 정보를 고칠 수 없고, 카카오톡 채널로 문의하면 운영자가 확인해서 바꾼다(10/14 nnoinn).
// 입력 규칙은 원장님 가입·매장 설정과 같은 validateBusinessInput(정민석)을 그대로 쓴다.

import { z } from 'zod';

import { type BusinessInput, onlyDigits, validateBusinessInput } from '@/app/owner/business-fields';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type ResultError } from '@/lib/result';
import { kstDateKey } from '@/lib/time';
import { requireAdmin } from '@/server/auth';
import { assertBusinessDocPath } from '@/server/storage';

import {
  BUSINESS_FIELDS,
  BUSINESS_UPDATE_ERRORS,
  type BusinessField,
  lockBusinessInfo,
  saveBusinessUpdate,
} from './business-info-store';
import { SHOP_REVIEW_ERRORS } from './review-store';

/** 변경 사유 글자 수 */
const REASON_MAX = 200;

export type AdminBusinessInput = BusinessInput & {
  /** 왜 바꾸는지. 예: 11/10 카카오톡 문의, 상호 변경 */
  reason: string;
};
export type AdminBusinessFieldErrors = Partial<Record<keyof AdminBusinessInput, string>>;
export type UpdateBusinessInfoResponse =
  | { ok: true; data: { changed: BusinessField[] } }
  | { ok: false; error: ResultError & { fieldErrors?: AdminBusinessFieldErrors } };

/**
 * 승인된 샵의 사업자 정보를 바꾼다. 바뀐 칸만 저장하고 운영자 작업 기록을 남긴다.
 * 등록증을 바꿨으면 createAdminBusinessDocUploadUrl로 그 샵 폴더에 올린 것인지 확인한다(예전 파일은 지우지 않는다).
 * 사업자등록번호가 바뀌면 지급대행 셀러 상태를 '등록 전'으로 돌린다
 */
export async function updateShopBusinessInfo(
  shopId: string,
  input: AdminBusinessInput,
): Promise<UpdateBusinessInfoResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const id = z.uuid().safeParse(shopId);
  if (!id.success) return fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);

  const checked = validateBusinessInput(input, kstDateKey(await getRequestNow()));
  const fieldErrors: AdminBusinessFieldErrors = checked.ok ? {} : { ...checked.fieldErrors };
  const reason = (input?.reason ?? '').trim();
  if (reason === '') fieldErrors.reason = '변경 사유를 입력해 주세요';
  else if (reason.length > REASON_MAX) fieldErrors.reason = `${REASON_MAX}자 이하로 입력해 주세요`;
  if (!checked.ok || Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: '입력한 내용을 다시 확인해 주세요', fieldErrors },
    };
  }
  const values = checked.data;

  return getDb().transaction(async (tx): Promise<UpdateBusinessInfoResponse> => {
    const current = await lockBusinessInfo(tx, id.data);
    if (!current) return fail('SHOP_NOT_FOUND', SHOP_REVIEW_ERRORS.SHOP_NOT_FOUND);
    if (current.status !== 'approved') {
      return fail('INVALID_STATUS', BUSINESS_UPDATE_ERRORS.INVALID_STATUS);
    }
    // 시드처럼 하이픈을 넣어 저장된 번호도 같은 번호로 본다
    const saved = {
      ...current,
      businessRegistrationNumber: onlyDigits(current.businessRegistrationNumber),
    };
    const changed = BUSINESS_FIELDS.filter((field) => values[field] !== saved[field]);
    if (changed.length === 0) return fail('NO_CHANGE', BUSINESS_UPDATE_ERRORS.NO_CHANGE);
    if (changed.includes('businessDocPath')) {
      const doc = await assertBusinessDocPath({ shopId: id.data }, values.businessDocPath);
      if (!doc.ok) return doc;
    }
    await saveBusinessUpdate(tx, {
      shopId: id.data,
      adminId: auth.data.userId,
      values: Object.fromEntries(changed.map((field) => [field, values[field]])),
      changed,
      reason,
    });
    return ok({ changed });
  });
}
