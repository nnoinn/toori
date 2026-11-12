'use server';

// 시간대 매물 서버 함수 (S-201 두 번째 방식·C-404, #308). 화면에서는 '@/server/slot-windows/actions'에서 가져온다.
// - 원장님(정민석 ①②③ 화면): createSlotWindows, getLastWindowSettings, closeSlotWindow
// - 고객(정찬형 시간대 상세 [예약하기]): holdWindowSlot
//
// 지금은 가짜 결과 버전이다. 로그인·내 샵·입점 승인 확인과 입력 확인(rules.ts, 매물 등록과 같은 계산)은 진짜이고,
// 저장·마감·홀딩은 하지 않는다. DEV_FAKE_SLOT_WINDOWS=on(로컬 개발)이면 원장님 등록·마감은 확인을 통과했을 때 저장한 것처럼
// 결과만 돌려주고, 지난 설정과 고객 쪽 가짜 시간대가 보인다. 실패는 DEV_FAKE_SLOT_WINDOWS_FAILURE로 흉내 낸다(fake.ts).
// 스위치가 꺼진 곳(배포 주소)에서는 확인까지만 하고 NOT_OPEN "시간대 매물은 곧 열려요"로 끝난다. 저장하지 않으면서 성공을 돌려주지 않는다
// 진짜 버전은 slot_windows에 저장하고 [예약하기]에서 매물 한 칸을 만들어 홀딩한다(결과 모양은 그대로)

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok } from '@/lib/result';
import { requireCustomer, requireShopOwner } from '@/server/auth';
import { paymentFail, type PaymentResult } from '@/server/payments/errors';
import type { HoldInfo } from '@/server/payments/types';
import { assertShopApproved } from '@/server/shops';

import { type SlotWindowResult, slotWindowFail } from './errors';
import { buildFakeWindow, FAKE_DISCOUNT_RATE, fakeWindowFailure, fakeWindowsOn } from './fake';
import { checkWindowDraft } from './rules';
import { readShopBusyRanges, readWindowShop } from './store';
import type {
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
 * 가짜 버전은 확인만 하고 저장하지 않는다. 스위치가 켜져 있으면 결과(시간대 id는 새로 만든 값), 꺼져 있으면 NOT_OPEN
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
  if (!fakeWindowsOn()) return slotWindowFail('NOT_OPEN');

  return ok({
    windows: checked.windows.map((window) => ({
      windowId: crypto.randomUUID(),
      startAt: window.start.toISOString(),
      endAt: window.end.toISOString(),
      publishAt: window.publishAt.toISOString(),
      status: window.status,
    })),
  });
}

/**
 * 원장님 ① 처음 열 때 채워 둘 설정: 그 샵이 마지막으로 올린 시간대의 서비스·할인율(지금 숨긴 메뉴는 뺀다). 올린 적 없으면 null.
 * 가짜 버전은 DEV_FAKE_SLOT_WINDOWS=on이면 내 샵의 숨기지 않은 메뉴 두 개를 30%로 준다
 */
export async function getLastWindowSettings(
  shopId: string,
): Promise<SlotWindowResult<LastWindowSettings | null>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  if (!fakeWindowsOn()) return ok(null);
  const shop = await readWindowShop(getDb(), shopId);
  const visible = shop?.menus.filter((menu) => !menu.hidden).slice(0, 2) ?? [];
  if (visible.length === 0) return ok(null);
  return ok({
    menus: visible.map((menu) => ({ menuId: menu.id, discountRate: FAKE_DISCOUNT_RATE })),
    newCustomerOnly: false,
  });
}

const closeSchema = z.object({
  windowId: z.uuid(),
  // 원장님이 고르는 마감 사유(매물 마감과 같다, S-206). hold_released는 고르는 사유가 아니다
  reason: z.enum(['other_channel', 'mistake', 'other']),
});

/**
 * 원장님 시간대 [마감](사유 기록). 안의 결제가 끝난 예약은 그대로다.
 * 가짜 버전은 저장하지 않는다. 스위치가 켜져 있으면 마감 시각, 꺼져 있으면 NOT_OPEN
 */
export async function closeSlotWindow(
  shopId: string,
  input: { windowId: string; reason: string },
): Promise<SlotWindowResult<{ closedAt: string }>> {
  const auth = await requireShopOwner(shopId);
  if (!auth.ok) return auth;
  const parsed = closeSchema.safeParse(input);
  if (!parsed.success) return slotWindowFail('INVALID_INPUT');
  const switched = fakeWindowFailure('closeSlotWindow');
  if (switched) return switched;
  if (!fakeWindowsOn()) return slotWindowFail('NOT_OPEN');
  return ok({ closedAt: (await getRequestNow()).toISOString() });
}

const holdSchema = z.object({
  windowId: z.uuid(),
  menuId: z.uuid(),
  startAt: z.iso.datetime({ offset: true }),
});

/**
 * 고객 시간대 상세 [예약하기](C-404). 고른 서비스·시작 시각으로 매물 한 칸을 만들어 10분 홀딩하고, 그 뒤로는 받은 slotId로
 * 지금 예약 확인·결제 화면을 그대로 쓴다. 그 사이 다른 고객이 그 시간을 골랐으면 TIME_TAKEN(화면은 getSlotWindow를 다시 불러온다).
 * 가짜 버전은 서비스·시각이 맞는지까지 확인하고 홀딩하지 않는다(진짜 버전에서 열린다)
 */
export async function holdWindowSlot(input: HoldWindowSlotInput): Promise<PaymentResult<HoldInfo>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return paymentFail('SLOT_NOT_AVAILABLE');
  const switched = fakeWindowFailure('holdWindowSlot');
  if (switched) return switched;
  if (!fakeWindowsOn()) return paymentFail('SLOT_NOT_AVAILABLE');

  const window = await buildFakeWindow(getDb(), parsed.data.windowId, await getRequestNow());
  const chosen = window?.menus.find((item) => item.menu.menuId === parsed.data.menuId);
  if (!chosen) return paymentFail('SLOT_NOT_AVAILABLE');
  const startAt = new Date(parsed.data.startAt).getTime();
  if (!chosen.startRanges.some((start) => start.start.getTime() === startAt)) {
    return paymentFail('TIME_TAKEN');
  }
  return {
    ok: false,
    error: {
      code: 'SLOT_NOT_AVAILABLE',
      message: '시간대 예약은 진짜 버전에서 열려요(가짜 결과 버전)',
    },
  };
}
