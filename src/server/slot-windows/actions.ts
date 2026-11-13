'use server';

// 시간대 매물 서버 함수 (S-201 두 번째 방식·C-404, #308). 화면에서는 '@/server/slot-windows/actions'에서 가져온다.
// - 원장님(정민석 ①②③ 화면): createSlotWindows, getLastWindowSettings, closeSlotWindow
// - 고객(정찬형 시간대 상세 [예약하기]): holdWindowSlot
//
// 모두 진짜 버전이다: 원장님 함수는 시간대 표에 저장·읽기·마감하고(①), [예약하기]는 매물 한 칸을 만들어 10분 홀딩한다(③).
// 실패는 로컬에서 DEV_FAKE_SLOT_WINDOWS_FAILURE로 흉내 낼 수 있다(fake.ts)

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { violatedConstraint } from '@/lib/db-error';
import { ok } from '@/lib/result';
import { requireCustomer, requireShopOwner } from '@/server/auth';
import { paymentFail, type PaymentResult } from '@/server/payments/errors';
import type { HoldInfo } from '@/server/payments/types';
import { assertShopApproved } from '@/server/shops';

import { type SlotWindowResult, slotWindowFail } from './errors';
import { fakeWindowFailure } from './fake';
import { acquireWindowHold, type WindowHoldOutcome } from './hold-store';
import { checkWindowDraft } from './rules';
import {
  closeWindow,
  insertSlotWindows,
  readLastWindowSettings,
  readShopBusyRanges,
  readWindowShop,
} from './store';
import type {
  ClosedSlotWindow,
  CreatedSlotWindow,
  CreateSlotWindowsInput,
  HoldWindowSlotInput,
  LastWindowSettings,
} from './types';

const createSchema = z.object({
  ranges: z
    .array(
      z.object({
        startAt: z.iso.datetime({ offset: true }),
        endAt: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1),
  menus: z.array(z.object({ menuId: z.uuid(), discountRate: z.number().int() })).min(1),
  newCustomerOnly: z.boolean(),
});

/**
 * 원장님 ③ 확인 → [등록하기]. 켜진 묶음마다 시간대 하나로 저장한다(전부 저장하거나 하나도 저장하지 않는다).
 * 확인(rules.ts) 뒤에 다른 요청이 같은 시간을 먼저 저장했으면 DB 제약이 막고 WINDOW_OVERLAP
 */
export async function createSlotWindows(
  shopId: string,
  input: CreateSlotWindowsInput,
): Promise<SlotWindowResult<{ windows: CreatedSlotWindow[] }>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const approved = await assertShopApproved(shopId);
  if (!approved.ok) return approved;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return slotWindowFail('INVALID_INPUT');
  const switched = fakeWindowFailure('createSlotWindows');
  if (switched) return switched;

  const db = getDb();
  const shop = await readWindowShop(db, shopId);
  if (!shop) return slotWindowFail('INVALID_INPUT');
  const ranges = parsed.data.ranges.map((range) => ({
    start: new Date(range.startAt),
    end: new Date(range.endAt),
  }));
  const from = new Date(Math.min(...ranges.map((range) => range.start.getTime())));
  const to = new Date(Math.max(...ranges.map((range) => range.end.getTime())));
  const now = await getRequestNow();
  const checked = checkWindowDraft({
    ranges,
    menus: parsed.data.menus,
    shopMenus: shop.menus,
    businessHours: shop.businessHours,
    busy: await readShopBusyRanges(db, { shopId, from, to }),
    now,
  });
  if (!checked.ok) return slotWindowFail(checked.code);

  try {
    const saved = await db.transaction((tx) =>
      insertSlotWindows(tx, {
        shopId,
        createdBy: auth.data.userId,
        newCustomerOnly: parsed.data.newCustomerOnly,
        windows: checked.windows,
        menus: checked.menus,
      }),
    );
    return ok({
      windows: saved.map((window) => ({
        windowId: window.id,
        startAt: window.startAt.toISOString(),
        endAt: window.endAt.toISOString(),
        publishAt: window.publishAt.toISOString(),
        status: window.status,
      })),
    });
  } catch (error) {
    if (violatedConstraint(error) === 'slot_windows_no_overlap') {
      return slotWindowFail('WINDOW_OVERLAP');
    }
    throw error;
  }
}

/**
 * 원장님 ① 처음 열 때 채워 둘 설정: 그 샵이 마지막으로 올린 시간대의 서비스·할인율(지금 숨긴 메뉴는 뺀다).
 * 올린 적 없거나 남은 서비스가 없으면 null
 */
export async function getLastWindowSettings(
  shopId: string,
): Promise<SlotWindowResult<LastWindowSettings | null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  return ok(await readLastWindowSettings(getDb(), shopId));
}

const closeSchema = z.object({
  windowId: z.uuid(),
  // 원장님이 고르는 마감 사유(매물 마감과 같다, S-206). hold_released는 고르는 사유가 아니다
  reason: z.enum(['other_channel', 'mistake', 'other']),
});

/**
 * 원장님 시간대 [마감](사유 기록). 결제가 끝난 예약은 그대로이고, 손님이 결제 중인 칸은 남겨서 keptSlots로 돌려준다
 * (#308 질문 1, 11/13 nnoinn). 마감 화면은 남긴 칸을 바로 알린다. 남긴 칸은 결제하면 예약으로 남고(원장님 새 예약 알림에
 * "마감 전에 결제를 시작한 손님"), 결제 없이 끝나면 닫히면서 원장님에게 알림이 간다.
 * 없거나 남의 시간대면 WINDOW_NOT_FOUND, 이미 마감했거나 시간이 지났으면 WINDOW_CLOSED
 */
export async function closeSlotWindow(
  shopId: string,
  input: { windowId: string; reason: string },
): Promise<SlotWindowResult<ClosedSlotWindow>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return slotWindowFail('INVALID_INPUT');
  const switched = fakeWindowFailure('closeSlotWindow');
  if (switched) return switched;
  const now = await getRequestNow();
  const closed = await getDb().transaction((tx) =>
    closeWindow(tx, {
      shopId,
      windowId: parsed.data.windowId,
      reason: parsed.data.reason,
      now,
    }),
  );
  if (!closed.ok) return slotWindowFail(closed.code);
  return ok({
    closedAt: closed.closedAt.toISOString(),
    keptSlots: closed.keptSlots.map((slot) => ({
      slotId: slot.slotId,
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      menuName: slot.menuName,
      holdExpiresAt: slot.holdExpiresAt.toISOString(),
    })),
  });
}

const holdSchema = z.object({
  windowId: z.uuid(),
  menuId: z.uuid(),
  startAt: z.iso.datetime({ offset: true }),
});

/**
 * 고객 시간대 상세 [예약하기](C-404). 고른 서비스·시작 시각으로 매물 한 칸을 만들어 10분 홀딩하고, 그 뒤로는 받은 slotId로
 * 지금 예약 확인·결제 화면을 그대로 쓴다. 지금 매물 홀딩(holdSlot)과 같은 규칙이다: 한 사람은 하나만(ALREADY_HOLDING),
 * 신규 고객 전용(NEW_CUSTOMER_ONLY). 그 사이 다른 고객이 그 시간을 골랐으면 TIME_TAKEN(화면은 getSlotWindow를 다시 불러온다).
 * 마감했거나 볼 수 없는 시간대, 시간대에 없는 서비스면 SLOT_NOT_AVAILABLE
 */
export async function holdWindowSlot(input: HoldWindowSlotInput): Promise<PaymentResult<HoldInfo>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return paymentFail('SLOT_NOT_AVAILABLE');
  const switched = fakeWindowFailure('holdWindowSlot');
  if (switched) return switched;

  const now = await getRequestNow();
  let outcome: WindowHoldOutcome;
  try {
    outcome = await getDb().transaction((tx) =>
      acquireWindowHold(tx, {
        windowId: parsed.data.windowId,
        menuId: parsed.data.menuId,
        startAt: new Date(parsed.data.startAt),
        customerId: auth.data.customerId,
        now,
      }),
    );
  } catch (error) {
    // 확인한 뒤 다른 손님이 같은 시간을 먼저 홀딩했다(매물 겹침 제약)
    if (violatedConstraint(error) === 'slots_no_overlap') return paymentFail('TIME_TAKEN');
    throw error;
  }
  if (!outcome.ok) {
    return outcome.code === 'ALREADY_HOLDING'
      ? paymentFail('ALREADY_HOLDING', { heldSlotId: outcome.heldSlotId })
      : paymentFail(outcome.code);
  }
  return ok({
    slotId: outcome.slotId,
    holdExpiresAt: outcome.holdExpiresAt.toISOString(),
    serverNow: now.toISOString(),
  });
}
