// 매물 등록 ①② 서버 검증 (DB, O4, S-201·S-204·S-209). 서버에서만 부른다.
// O5에서 저장할 때도 같은 검증을 트랜잭션 안에서 다시 부른다(tx를 넘긴다). 겹침은 DB 제약(slots_no_overlap)이 마지막으로 막는다.

import 'server-only';

import { and, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@/db';
import { menus, shops, slots } from '@/db/schema';
import type { BusinessHours } from '@/db/schema/shops';
import { fail, ok, type Result } from '@/lib/result';
import type { ShopCategory } from '@/server/policy';

import { isServiceTypeOf } from '../../settings/menu/menu';
import {
  checkBusinessHours,
  checkStart,
  HOURS_PROBLEM_MESSAGES,
  START_PROBLEM_MESSAGES,
  slotEnd,
  type TimeRange,
} from './slot-time';

type Db = Pick<ReturnType<typeof getDb>, 'select'>;

/** 겹침을 보는 매물 상태(S-209). 마감·취소·완료는 같은 시간에 다시 올릴 수 있다 */
const BLOCKING_STATUSES = ['scheduled', 'published', 'reserved'] as const;

export const SLOT_DRAFT_ERRORS = {
  MENU_NOT_FOUND: '메뉴를 다시 골라 주세요',
  SLOT_OVERLAP: '같은 시간에 이미 올린 매물이 있어요. 다른 시각을 골라 주세요',
} as const;

/** 고른 메뉴(매물에 복사할 값) */
export type DraftMenu = {
  id: string;
  serviceType: string;
  name: string;
  description: string | null;
  listPrice: number;
  durationMinutes: number;
};

export type SlotDraft = { menu: DraftMenu; start: Date; end: Date };

const draftSchema = z.object({ menuId: z.uuid(), startAt: z.iso.datetime({ offset: true }) });

/** 매물 등록에 필요한 샵 값(업종, 영업시간). 샵이 없으면 null */
export async function selectSlotShop(
  db: Db,
  shopId: string,
): Promise<{ category: ShopCategory; businessHours: BusinessHours } | null> {
  const [row] = await db
    .select({ category: shops.category, businessHours: shops.businessHours })
    .from(shops)
    .where(eq(shops.id, shopId));
  return row ? { ...row, category: row.category as ShopCategory } : null;
}

/** 그 샵에서 [from, to)와 겹치는 매물 시간(예약대기·게시중·예약됨) */
export async function selectBusyRanges(
  db: Db,
  shopId: string,
  from: Date,
  to: Date,
): Promise<TimeRange[]> {
  const rows = await db
    .select({ start: slots.startAt, end: slots.endAt })
    .from(slots)
    .where(
      and(
        eq(slots.shopId, shopId),
        inArray(slots.status, BLOCKING_STATUSES),
        lt(slots.startAt, to),
        gt(slots.endAt, from),
      ),
    )
    .orderBy(slots.startAt);
  return rows;
}

/**
 * ①② 고른 값을 검증한다. 권한·입점 승인은 부른 쪽이 먼저 확인한다.
 * 메뉴: 그 샵의 숨기지 않은 메뉴이고 지금 업종의 서비스 종류 → 시작 시각: 단위·지금 이후·48시간 안
 * → 영업시간 안(입력한 요일만) → 시간 겹침
 */
export async function validateSlotDraft(
  db: Db,
  shopId: string,
  input: unknown,
  now: Date,
): Promise<Result<SlotDraft>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return fail('INVALID_INPUT', '메뉴와 시작 시각을 골라 주세요');

  const [shop, [menu]] = await Promise.all([
    selectSlotShop(db, shopId),
    db
      .select({
        id: menus.id,
        serviceType: menus.serviceType,
        name: menus.name,
        description: menus.description,
        listPrice: menus.listPrice,
        durationMinutes: menus.durationMinutes,
      })
      .from(menus)
      .where(
        and(eq(menus.id, parsed.data.menuId), eq(menus.shopId, shopId), isNull(menus.hiddenAt)),
      ),
  ]);
  if (!shop || !menu || !isServiceTypeOf(shop.category, menu.serviceType)) {
    return fail('MENU_NOT_FOUND', SLOT_DRAFT_ERRORS.MENU_NOT_FOUND);
  }

  const start = new Date(parsed.data.startAt);
  const problem = checkStart(start, now);
  if (problem) return fail(problem, START_PROBLEM_MESSAGES[problem]);

  const end = slotEnd(start, menu.durationMinutes);
  const hoursProblem = checkBusinessHours({ start, end }, shop.businessHours);
  if (hoursProblem) return fail(hoursProblem, HOURS_PROBLEM_MESSAGES[hoursProblem]);

  if ((await selectBusyRanges(db, shopId, start, end)).length > 0) {
    return fail('SLOT_OVERLAP', SLOT_DRAFT_ERRORS.SLOT_OVERLAP);
  }
  return ok({ menu, start, end });
}
