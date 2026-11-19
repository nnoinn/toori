'use server';

// 운영자 매물 관리 (#373 ④, #433, 11/15 nnoinn). 운영자 샵 상세·매물 목록(강규민)에서 부른다.
// 모두 운영자만(requireAdmin)이고 사유(다시 열 때는 메모)가 필수다. 처리 기록은 같은 트랜잭션에서 남긴다(admin-store.ts).
// 성공하면 원장님에게 알림이 간다. 운영자가 적은 사유는 원장님에게 보이지 않는다(11/16 강규민 결정, 카카오톡 채널로 안내).
// 멈춤·강제 마감 때는 원장님에게 보여 줄 사유 코드(정책 PUBLISH_PAUSE_CODES·ADMIN_CLOSE_CODES, #489)도 꼭 고른다.
//
// - pauseShopPublishing / resumeShopPublishing: 샵의 새 매물 게시를 멈추고 다시 연다. 새 등록만 막고 이미 올린 매물·예약은 그대로다(결정 3)
// - forceCloseSlot: 판매 전 매물을 운영자 마감으로 닫는다. 손님이 결제 중(10분 홀딩)이면 막는다
// - forceCloseWindow: 시간대 매물을 운영자 마감으로 닫는다. 원장님 시간대 마감과 같아서 손님이 결제 중인 칸은 남긴다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok, type Result } from '@/lib/result';
import { toAdminReason } from '@/server/admin/reason';
import { requireAdmin } from '@/server/auth';
import {
  ADMIN_NOTICE_CODES_BY_USE,
  type AdminNoticeUse,
  isAdminNoticeCodeFor,
} from '@/server/policy/admin-notice';
import {
  notifyPublishPauseChanged,
  notifySlotForceClosed,
  notifyWindowForceClosed,
} from '@/server/notifications/alerts';

import { adminSlotFail, type AdminSlotErrorCode } from './admin-errors';
import {
  type AdminSlotTx,
  forceCloseSlotInTx,
  forceCloseWindowInTx,
  pausePublishingInTx,
  resumePublishingInTx,
} from './admin-store';

const idSchema = z.uuid();

/** 그 쓰는 곳의 사유 코드로 읽는다. 목록에 없으면 null(CODE_REQUIRED) */
function codeFor<U extends AdminNoticeUse>(use: U, raw: unknown) {
  return (): (typeof ADMIN_NOTICE_CODES_BY_USE)[U][number] | null =>
    isAdminNoticeCodeFor(use, raw) ? raw : null;
}

/** 사유 코드를 받지 않는 처리(다시 열기) */
const noCode = () => undefined;

/** 권한·id·사유·사유 코드를 확인하고 한 트랜잭션에서 저장한다 */
async function runAdmin<T, C>(
  id: unknown,
  rawReason: unknown,
  notFound: AdminSlotErrorCode,
  readCode: () => C | null,
  save: (
    tx: AdminSlotTx,
    input: { id: string; adminId: string; reason: string; code: C; now: Date },
  ) => Promise<Result<T>>,
): Promise<Result<T>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return adminSlotFail(notFound);
  const reason = toAdminReason(rawReason);
  if (!reason.ok) return adminSlotFail(reason.problem);
  const code = readCode();
  if (code === null) return adminSlotFail('CODE_REQUIRED');
  const now = await getRequestNow();
  return getDb().transaction((tx) =>
    save(tx, { id: parsed.data, adminId: auth.data.userId, reason: reason.reason, code, now }),
  );
}

/** 샵의 새 매물 게시를 멈춘다. SHOP_NOT_FOUND·ALREADY_PAUSED, 사유가 비면 REASON_REQUIRED, 사유 코드가 맞지 않으면 CODE_REQUIRED */
export async function pauseShopPublishing(input: {
  shopId: string;
  reason: string;
  code: string;
}): Promise<Result<{ shopId: string; pausedAt: string }>> {
  const paused = await runAdmin(
    input?.shopId,
    input?.reason,
    'SHOP_NOT_FOUND',
    codeFor('publish_pause', input?.code),
    (tx, { id, ...args }) => pausePublishingInTx(tx, { ...args, shopId: id }),
  );
  if (!paused.ok) return paused;
  notifyPublishPauseChanged(getDb(), {
    shopId: paused.data.shopId,
    paused: true,
    changedAt: paused.data.pausedAt,
  });
  return ok({ shopId: paused.data.shopId, pausedAt: paused.data.pausedAt.toISOString() });
}

/** 멈춘 게시를 다시 연다. SHOP_NOT_FOUND·NOT_PAUSED, 메모가 비면 REASON_REQUIRED */
export async function resumeShopPublishing(input: {
  shopId: string;
  memo: string;
}): Promise<Result<{ shopId: string; resumedAt: string }>> {
  const resumed = await runAdmin(
    input?.shopId,
    input?.memo,
    'SHOP_NOT_FOUND',
    noCode,
    (tx, { id, adminId, reason, now }) =>
      resumePublishingInTx(tx, { shopId: id, adminId, reason, now }),
  );
  if (!resumed.ok) return resumed;
  notifyPublishPauseChanged(getDb(), {
    shopId: resumed.data.shopId,
    paused: false,
    changedAt: resumed.data.resumedAt,
  });
  return ok({ shopId: resumed.data.shopId, resumedAt: resumed.data.resumedAt.toISOString() });
}

/**
 * 판매 전 매물을 운영자 마감으로 닫는다. SLOT_NOT_FOUND·SLOT_ON_HOLD·SLOT_NOT_OPEN·WINDOW_SLOT,
 * 사유가 비면 REASON_REQUIRED, 사유 코드가 맞지 않으면 CODE_REQUIRED
 */
export async function forceCloseSlot(input: {
  slotId: string;
  reason: string;
  code: string;
}): Promise<Result<{ slotId: string; closedAt: string }>> {
  const closed = await runAdmin(
    input?.slotId,
    input?.reason,
    'SLOT_NOT_FOUND',
    codeFor('close', input?.code),
    (tx, { id, ...args }) => forceCloseSlotInTx(tx, { ...args, slotId: id }),
  );
  if (!closed.ok) return closed;
  notifySlotForceClosed(getDb(), closed.data.slotId);
  return ok({ slotId: closed.data.slotId, closedAt: closed.data.closedAt.toISOString() });
}

/**
 * 시간대 매물을 운영자 마감으로 닫는다. 손님이 결제 중이라 남긴 칸 수를 돌려준다(결제하면 예약으로 남고, 아니면 저절로 닫힌다).
 * WINDOW_NOT_FOUND·WINDOW_CLOSED, 사유가 비면 REASON_REQUIRED, 사유 코드가 맞지 않으면 CODE_REQUIRED
 */
export async function forceCloseWindow(input: {
  windowId: string;
  reason: string;
  code: string;
}): Promise<Result<{ windowId: string; closedAt: string; keptSlotCount: number }>> {
  const closed = await runAdmin(
    input?.windowId,
    input?.reason,
    'WINDOW_NOT_FOUND',
    codeFor('close', input?.code),
    (tx, { id, ...args }) => forceCloseWindowInTx(tx, { ...args, windowId: id }),
  );
  if (!closed.ok) return closed;
  notifyWindowForceClosed(getDb(), closed.data.windowId);
  return ok({
    windowId: closed.data.windowId,
    closedAt: closed.data.closedAt.toISOString(),
    keptSlotCount: closed.data.keptSlots.length,
  });
}
