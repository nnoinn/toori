'use server';

// 입점 승인·반려 (A-101). 상세 화면의 버튼(review-actions.tsx)이 부른다.
// 처리는 #105의 approveShop·rejectShop(관리자 확인, 승인 대기일 때만, 운영자 작업 기록)이 하고,
// 여기서는 성공하면 운영자 화면(목록·첫 화면의 대기 수·상세)을 새로 읽게 한다.

import { revalidatePath } from 'next/cache';

import type { Result } from '@/lib/result';
import { approveShop, rejectShop } from '@/server/shops/review';

export async function approveShopAction(shopId: string): Promise<Result<null>> {
  const result = await approveShop(shopId);
  if (result.ok) revalidatePath('/admin', 'layout');
  return result;
}

export async function rejectShopAction(shopId: string, reason: string): Promise<Result<null>> {
  const result = await rejectShop(shopId, reason);
  if (result.ok) revalidatePath('/admin', 'layout');
  return result;
}
