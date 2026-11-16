'use server';

// 내 운영자 이름 정하기·바꾸기 (11/16 nnoinn, AUTH-13). 화면 위 이름 옆 [이름 정하기·바꾸기](admin-name-edit.tsx)가 부른다.
// 처리는 updateMyAdminName(운영자 확인, 자기 이름만)이 하고, 여기서는 성공하면 운영자 화면을 새로 읽게 한다.

import { revalidatePath } from 'next/cache';

import type { Result } from '@/lib/result';
import { updateMyAdminName } from '@/server/admin/admin-profile';

export async function updateMyAdminNameAction(name: string): Promise<Result<{ name: string }>> {
  const result = await updateMyAdminName(name);
  // 화면 위 이름과 운영자 기록·이의제기 화면의 운영자 이름이 새 이름으로 보이게 한다
  if (result.ok) revalidatePath('/admin', 'layout');
  return result;
}
