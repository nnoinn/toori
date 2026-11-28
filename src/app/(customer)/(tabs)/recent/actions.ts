'use server';

// 최근 본 매물(C-212) 목록을 지금 값으로 읽는 서버 함수. 오른쪽 아래 [최근 본 매물]을 열 때 부른다.
// 화면이 넘기는 것은 이 기기에 남긴 매물 id뿐이다. 로그인한 고객은 서버가 쿠키로 정하고(신규 고객 전용 거르기),
// 보여도 되는 매물인지(승인 샵·게시 뒤)는 매물 상세와 같은 조건으로 다시 본다. 읽기만 한다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type Result } from '@/lib/result';
import { getCurrentAccount } from '@/server/auth';
import { getSlotWindow } from '@/server/slot-windows';

import { recentWindowItem, selectRecentSlots } from './queries';
import { RECENT_SLOT_LIMIT } from './recent-rules';
import type { RecentItem } from './types';

const LOAD_FAILED = '최근 본 매물을 불러오지 못했어요. 잠시 후 다시 시도해 주세요';

const inputSchema = z.object({
  slotIds: z.array(z.uuid()).max(RECENT_SLOT_LIMIT),
  windowIds: z.array(z.uuid()).max(RECENT_SLOT_LIMIT),
});

export async function loadRecentItems(input: unknown): Promise<Result<{ items: RecentItem[] }>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', LOAD_FAILED);
  const { slotIds, windowIds } = parsed.data;
  try {
    const [account, now] = await Promise.all([getCurrentAccount(), getRequestNow()]);
    // 고객 모드로 로그인한 고객 계정만. 원장님 모드로 둘러보면 null(#49 3장)
    const customerId = account?.mode === 'customer' ? account.customerId : null;
    const db = getDb();
    const [slotItems, windows] = await Promise.all([
      selectRecentSlots(db, { slotIds, customerId, now }),
      Promise.all(windowIds.map((windowId) => getSlotWindow(db, { windowId, customerId, now }))),
    ]);
    const windowItems = windows.flatMap((window) => {
      const item = window ? recentWindowItem(window, now) : null;
      return item ? [item] : [];
    });
    return ok({ items: [...slotItems, ...windowItems] });
  } catch (error) {
    console.error('[loadRecentItems]', error);
    return fail('LOAD_FAILED', LOAD_FAILED);
  }
}
