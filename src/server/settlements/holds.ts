'use server';

// 운영자 정산 보류·풀기 (#373 ②, #433, 11/15 nnoinn). 운영자 예약 상세·샵 정산 화면(강규민)에서 부른다.
// 모두 운영자만(requireAdmin)이고 사유(풀 때는 메모)가 필수다. 처리 기록은 같은 트랜잭션에서 남긴다(hold-store.ts).
// 보류를 걸 때는 원장님에게 보여 줄 사유 코드(정책 SETTLEMENT_HOLD_CODES, #489)도 꼭 고른다.
//
// - holdReservationSettlement: 거래 하나를 멈춘다. 아직 묶이지 않은 거래만(묶인 정산은 지급 요청 전 확인 A-105에서 막는다)
// - holdShopSettlement: 샵 전체를 멈춘다. 아직 묶이지 않은 그 샵 거래가 모두 목요일 묶기에서 빠진다
// - releaseSettlementHold: 보류를 푼다. 풀린 거래는 돌아오는 지급일에 들어간다(지급일 0시 뒤에 풀면 그다음 지급일)
// 원장님 정산 화면에는 "운영자 확인 중"과 고른 사유 코드만 보이고, 운영자가 쓴 사유는 숨긴다(11/15 nnoinn, #489).
// 걸거나 풀면 원장님에게 알림이 간다(#489): 걸 때는 대상(예약 또는 샵 전체 정산)과 고른 사유·다음에 할 일, 풀 때는 돌아오는 지급일 안내

import { z } from 'zod';

import { getDb } from '@/db';
import { violatedConstraint } from '@/lib/db-error';
import { getRequestNow } from '@/lib/request-time';
import type { Result } from '@/lib/result';
import { toAdminReason } from '@/server/admin/reason';
import { requireAdmin } from '@/server/auth';
import { notifySettlementHeld, notifySettlementReleased } from '@/server/notifications/alerts';
import { isAdminNoticeCodeFor } from '@/server/policy/admin-notice';

import { settlementHoldFail } from './hold-errors';
import {
  type HeldSettlement,
  holdReservationInTx,
  type HoldTx,
  holdShopInTx,
  releaseHoldInTx,
  type ReleasedSettlementHold,
} from './hold-store';

const idSchema = z.uuid();

/** 같은 거래·샵에 풀리지 않은 보류는 하나(unique 인덱스). 잠금으로 먼저 확인하지만 마지막 안전장치로 남긴다 */
const ACTIVE_HOLD_UNIQUE = new Set([
  'settlement_holds_reservation_active_unique',
  'settlement_holds_shop_active_unique',
]);

async function runHold(
  run: (tx: HoldTx) => Promise<Result<HeldSettlement>>,
): Promise<Result<HeldSettlement>> {
  try {
    return await getDb().transaction(run);
  } catch (error) {
    const constraint = violatedConstraint(error);
    if (constraint && ACTIVE_HOLD_UNIQUE.has(constraint)) return settlementHoldFail('ALREADY_HELD');
    throw error;
  }
}

/**
 * 거래 하나의 정산 보류. RESERVATION_NOT_FOUND·NOTHING_TO_SETTLE·ALREADY_BUNDLED·ALREADY_HELD,
 * 사유가 비면 REASON_REQUIRED, 원장님에게 보여 줄 사유 코드가 없거나 정산 보류에 없는 코드면 CODE_REQUIRED
 */
export async function holdReservationSettlement(input: {
  reservationId: string;
  reason: string;
  code: string;
}): Promise<Result<HeldSettlement>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.reservationId).success) {
    return settlementHoldFail('RESERVATION_NOT_FOUND');
  }
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return settlementHoldFail(reason.problem);
  const code = input?.code;
  if (!isAdminNoticeCodeFor('settlement_hold', code)) return settlementHoldFail('CODE_REQUIRED');
  const now = await getRequestNow();
  const held = await runHold((tx) =>
    holdReservationInTx(tx, {
      reservationId: input.reservationId,
      adminId: auth.data.userId,
      reason: reason.reason,
      code,
      now,
    }),
  );
  if (held.ok) notifySettlementHeld(getDb(), held.data.holdId);
  return held;
}

/** 샵 전체의 정산 보류. SHOP_NOT_FOUND·ALREADY_HELD, 사유가 비면 REASON_REQUIRED, 사유 코드가 맞지 않으면 CODE_REQUIRED */
export async function holdShopSettlement(input: {
  shopId: string;
  reason: string;
  code: string;
}): Promise<Result<HeldSettlement>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.shopId).success) return settlementHoldFail('SHOP_NOT_FOUND');
  const reason = toAdminReason(input?.reason);
  if (!reason.ok) return settlementHoldFail(reason.problem);
  const code = input?.code;
  if (!isAdminNoticeCodeFor('settlement_hold', code)) return settlementHoldFail('CODE_REQUIRED');
  const now = await getRequestNow();
  const held = await runHold((tx) =>
    holdShopInTx(tx, {
      shopId: input.shopId,
      adminId: auth.data.userId,
      reason: reason.reason,
      code,
      now,
    }),
  );
  if (held.ok) notifySettlementHeld(getDb(), held.data.holdId);
  return held;
}

/** 정산 보류를 푼다. HOLD_NOT_FOUND·ALREADY_RELEASED, 메모가 비면 REASON_REQUIRED */
export async function releaseSettlementHold(input: {
  holdId: string;
  memo: string;
}): Promise<Result<ReleasedSettlementHold>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!idSchema.safeParse(input?.holdId).success) return settlementHoldFail('HOLD_NOT_FOUND');
  const memo = toAdminReason(input?.memo);
  if (!memo.ok) return settlementHoldFail(memo.problem);
  const now = await getRequestNow();
  const released = await getDb().transaction((tx) =>
    releaseHoldInTx(tx, {
      holdId: input.holdId,
      adminId: auth.data.userId,
      memo: memo.reason,
      now,
    }),
  );
  if (released.ok) notifySettlementReleased(getDb(), released.data.holdId);
  return released;
}
