'use server';

// 찜 버튼 (#215 2장, C-209). 매물 상세 샵 정보의 하트에서 부른다. 본인 고객 계정의 찜만 바꾼다(X-102).

import { refresh } from 'next/cache';
import { z } from 'zod';

import { getDb } from '@/db';
import { fail, ok, type Result } from '@/lib/result';
import { requireCustomer } from '@/server/auth';

import { addFavorite, removeFavorite } from './store';

const favoriteInputSchema = z.object({ shopId: z.uuid(), favorite: z.boolean() });

/** 샵을 찜하거나(favorite: true) 푼다. 여러 번 눌러도 결과는 같다 */
export async function setFavorite(input: unknown): Promise<Result<{ favorite: boolean }>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = favoriteInputSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '찜할 샵을 찾지 못했어요');
  const { shopId, favorite } = parsed.data;
  try {
    if (favorite) {
      const added = await addFavorite(getDb(), auth.data.customerId, shopId);
      if (!added) return fail('SHOP_NOT_FOUND', '지금은 찜할 수 없는 샵이에요');
    } else {
      await removeFavorite(getDb(), auth.data.customerId, shopId);
    }
  } catch (error) {
    console.error('[setFavorite] 저장 실패:', error instanceof Error ? error.name : 'unknown');
    return fail('SAVE_FAILED', '찜을 저장하지 못했어요. 잠시 후 다시 시도해 주세요');
  }
  // 상세의 하트와 찜한 샵 매물 화면이 새 값으로 다시 그려지게 한다
  refresh();
  return ok({ favorite });
}
