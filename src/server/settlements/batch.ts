// 목요일 정산 묶기 (X-206, #353, W20 ③). 서버에서만 부른다. 예약 작업(/api/cron/settlement-batch)이 매일 새벽 부르고,
// 오늘이 지급일(매주 목요일, 공휴일이면 다음 영업일)일 때만 묶는다.
//
// 1. 기준 시각 = 지급일 0시(한국 시간). 아직 정산 줄이 없는 끝난 거래 중 정산할 종류이고(settlementKindOf),
//    이의제기 접수 기한이 기준 시각까지 지났고 확인 중 이의제기가 없는 것(isReadyToSettle)을 고른다
// 2. 샵마다 한 트랜잭션으로 정산 묶음·정산 줄·패널티 뗀 기록을 저장한다(batch-rules.ts buildShopSettlement).
//    한 샵이 실패해도 다른 샵은 계속하고, 실패한 샵은 다음 지급일에 다시 묶인다
// 3. 결제 수수료율(PAYMENT_FEE_RATE)이 정해지기 전(PG 계약 전)에는 정산 금액을 확정할 수 없어서 묶지 않는다(#134, #353)
//
// 다시 불러도 같다: 같은 지급일에 이미 묶은 샵은 건너뛰고, 같은 거래·같은 기간은 DB unique가 두 번 저장되지 않게 막는다.
// 지급 요청은 하지 않는다(운영자가 A-105에서 확인한 뒤 요청한다. PG 지급대행 계약 전에는 잠가 둔다)

import 'server-only';

import type { getDb } from '@/db';
import { violatedConstraint } from '@/lib/db-error';
import type { PlatformFeeMode } from '@/server/policy';

import { buildShopSettlement, kstDateStart, payoutDateOn } from './batch-rules';
import {
  type BatchCandidate,
  hasSettlementOn,
  insertShopSettlement,
  readBatchCandidates,
  readOutstandingPenalties,
  readPreviousPayoutDate,
} from './batch-store';
import { isReadyToSettle, type SettleKind, settlementKindOf } from './settle-rules';

type Db = ReturnType<typeof getDb>;

export type SettlementBatchResult =
  | { status: 'not_payout_day' }
  | { status: 'payment_fee_rate_missing'; payoutDate: string }
  | {
      status: 'done';
      payoutDate: string;
      /** 이번에 묶은 샵 수와 거래 수 */
      shops: number;
      items: number;
      /** 패널티를 떼고 0원이라 지급 요청 없이 끝난 샵 수 */
      zeroPayouts: number;
      /** 이 지급일에 이미 묶여 있어 건너뛴 샵 수 */
      skipped: number;
      /** 저장하다 실패한 샵 수(다음 지급일에 다시 묶인다) */
      failed: number;
    };

type ReadyItem = { candidate: BatchCandidate; kind: SettleKind; occurredAt: Date };

/** 오늘이 지급일이면 그날 묶을 거래를 샵별로 묶어 저장한다 */
export async function runSettlementBatch(
  db: Db,
  input: { now: Date; paymentFeeRate: number | null; mode?: PlatformFeeMode },
): Promise<SettlementBatchResult> {
  const payoutDate = payoutDateOn(input.now);
  if (!payoutDate) return { status: 'not_payout_day' };
  const { paymentFeeRate } = input;
  if (paymentFeeRate === null) return { status: 'payment_fee_rate_missing', payoutDate };

  const cutoff = kstDateStart(payoutDate);
  const byShop = new Map<string, ReadyItem[]>();
  for (const candidate of await readBatchCandidates(db, { cutoff })) {
    const kind = settlementKindOf(candidate);
    if (!kind) continue;
    if (!isReadyToSettle(candidate, { hasOpenDispute: candidate.hasOpenDispute, cutoff })) {
      continue;
    }
    const occurredAt =
      candidate.status === 'completed' ? candidate.visitRecordedAt : candidate.cancelledAt;
    if (!occurredAt) continue;
    byShop.set(candidate.shopId, [
      ...(byShop.get(candidate.shopId) ?? []),
      { candidate, kind, occurredAt },
    ]);
  }

  const result = { shops: 0, items: 0, zeroPayouts: 0, skipped: 0, failed: 0 };
  for (const [shopId, ready] of byShop) {
    try {
      const saved = await db.transaction(async (tx) => {
        if (await hasSettlementOn(tx, { shopId, payoutDate })) return null;
        const draft = buildShopSettlement({
          payoutDate,
          previousPayoutDate: await readPreviousPayoutDate(tx, shopId),
          items: ready.map(({ candidate, kind, occurredAt }) => ({
            orderId: candidate.orderId,
            kind,
            salePrice: candidate.salePrice,
            discountRate: candidate.discountRate,
            couponAmount: candidate.couponAmount,
            occurredAt,
          })),
          penalties: await readOutstandingPenalties(tx, shopId),
          paymentFeeRate,
          mode: input.mode,
        });
        await insertShopSettlement(tx, { shopId, draft, now: input.now });
        return draft;
      });
      if (!saved) {
        result.skipped += 1;
        continue;
      }
      result.shops += 1;
      result.items += saved.itemCount;
      if (saved.status === 'paid') result.zeroPayouts += 1;
    } catch (error) {
      // 같은 때 다른 묶기가 먼저 저장했다(같은 기간·같은 거래). 다시 묶지 않는다
      const constraint = violatedConstraint(error);
      if (
        constraint === 'settlements_shop_period_unique' ||
        constraint === 'settlement_items_order_id_unique'
      ) {
        result.skipped += 1;
        continue;
      }
      result.failed += 1;
      console.error(
        '[settlements] 정산 묶기 실패:',
        shopId,
        error instanceof Error ? error.name : 'unknown',
      );
    }
  }
  return { status: 'done', payoutDate, ...result };
}
