'use server';

// 내 정보 저장 (J9, C-103). 이 화면에서만 쓰는 서버 코드라 화면 폴더에 둔다.
// 본인 고객 계정만 고친다(X-102). 연락처는 로그에 남기지 않는다.

import { refresh } from 'next/cache';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db';
import { customers } from '@/db/schema';
import { fail, ok, type Result } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { customerPhoneSchema, PHONE_FORMAT_MESSAGE, profileSchema } from './profile-rules';

/** 닉네임·연락처를 저장한다. 형식이 틀리면 첫 번째 이유를 돌려준다 */
export async function updateMyProfile(input: unknown): Promise<Result<null>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return fail('INVALID_INPUT', parsed.error.issues[0]?.message ?? '입력한 내용을 확인해 주세요');
  }
  try {
    await getDb()
      .update(customers)
      .set({ nickname: parsed.data.nickname, phone: parsed.data.phone })
      .where(eq(customers.id, auth.data.customerId));
  } catch (error) {
    // 입력값(연락처)은 남기지 않고 오류 이름만 남긴다
    console.error('[updateMyProfile] 저장 실패:', error instanceof Error ? error.name : 'unknown');
    return fail('SAVE_FAILED', '저장하지 못했어요. 잠시 후 다시 시도해 주세요');
  }
  refresh();
  return ok(null);
}

/** 연락처만 저장한다(예약 확인 화면 J10, C-401). 예약하려면 꼭 있어야 해서 비우는 건 받지 않는다 */
export async function updateMyPhone(input: unknown): Promise<Result<{ phone: string }>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = customerPhoneSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', PHONE_FORMAT_MESSAGE);
  if (parsed.data === null) return fail('PHONE_REQUIRED', '휴대폰 번호를 입력해 주세요');
  const phone = parsed.data;
  try {
    await getDb().update(customers).set({ phone }).where(eq(customers.id, auth.data.customerId));
  } catch (error) {
    console.error('[updateMyPhone] 저장 실패:', error instanceof Error ? error.name : 'unknown');
    return fail('SAVE_FAILED', '저장하지 못했어요. 잠시 후 다시 시도해 주세요');
  }
  return ok({ phone });
}
