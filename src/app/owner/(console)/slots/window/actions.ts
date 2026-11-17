'use server';

// 시간대 매물 할인율 수정 서버 함수 (11/16 정민석). 대시보드 시간대 줄의 [수정] 창(dashboard/edit-window-dialog.tsx)에서 부른다.
// 시간대 등록·마감은 공통 서버 함수(server/slot-windows/actions.ts)를 쓰고, 이 화면에서만 쓰는 할인율 수정은 여기 둔다.

import { refresh } from 'next/cache';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import type { Result } from '@/lib/result';

import { requireApprovedOwner } from '../require-approved-owner';
import { updateWindowRatesInDb } from './window-rates-store';

/** 시간대 서비스마다 할인율을 바꾼다. 할인가는 서버가 다시 계산한다. input: { windowId, rates: [{ menuId, discountRate }] } */
export async function updateWindowRates(
  shopId: string,
  input: unknown,
): Promise<Result<{ changed: number }>> {
  const check = await requireApprovedOwner(shopId);
  if (!check.ok) return check;

  const updated = await updateWindowRatesInDb(getDb(), shopId, input, await getRequestNow());
  // 대시보드 줄의 할인율이 바로 보이게 화면 값을 다시 받는다
  if (updated.ok) refresh();
  return updated;
}
