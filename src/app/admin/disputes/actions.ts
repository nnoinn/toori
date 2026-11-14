'use server';

// 이의제기 결론 기록과 카카오톡 채널 건 등록 (A-104, W19 ②). 상세의 결론 칸(resolve-form.tsx)과
// 예약 상세의 [이의제기 등록](register-dispute.tsx)이 부른다. 처리는 '@/server/disputes/admin'이 하고(운영자 확인·작업 기록),
// 여기서는 성공하면 운영자 화면(목록·상세·예약 상세)을 새로 읽게 한다.

import { revalidatePath } from 'next/cache';

import { registerKakaoDispute, resolveDispute } from '@/server/disputes/admin';
import type { DisputeResult } from '@/server/disputes/errors';
import type {
  RegisteredDispute,
  RegisterKakaoDisputeInput,
  ResolvedDispute,
  ResolveDisputeInput,
} from '@/server/disputes/types';

export async function resolveDisputeAction(
  input: ResolveDisputeInput,
): Promise<DisputeResult<ResolvedDispute>> {
  const result = await resolveDispute(input);
  if (result.ok) revalidatePath('/admin', 'layout');
  return result;
}

export async function registerKakaoDisputeAction(
  input: RegisterKakaoDisputeInput,
): Promise<DisputeResult<RegisteredDispute>> {
  const result = await registerKakaoDispute(input);
  if (result.ok) revalidatePath('/admin', 'layout');
  return result;
}
