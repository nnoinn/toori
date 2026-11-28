'use server';

// 첫 로그인 안내(C-107)를 닫으면 부른다. 세션의 고객 계정에만 본 시각을 남긴다(입력은 받지 않는다)

import { getDb } from '@/db';
import { ok, type Result } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { markOnboardingSeen } from './onboarding-store';

export async function finishOnboarding(): Promise<Result<null>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  await markOnboardingSeen(getDb(), auth.data.customerId);
  return ok(null);
}
