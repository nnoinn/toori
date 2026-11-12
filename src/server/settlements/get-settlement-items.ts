'use server';

// 원장님 정산 내역 (S-501·S-502, 연결 #10·#20, #129, W20). 정민석 정산 화면(O15)에서 부른다.
// 화면에서는 '@/server/settlements/get-settlement-items'에서 가져온다. 결과 모양은 './types'.
// 본인 샵만 본다. 기간은 방문·노쇼 처리 또는 취소한 한국 날짜 기준이다(시작일·끝일 포함, 최대 366일).

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok, type Result } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { PAYMENT_FEE_RATE } from '@/server/policy';

import { settlementFail } from './errors';
import { readOutstandingPenalty, readShopSettlementRows } from './settlement-store';
import { buildSettlementList, parseSettlementPeriod } from './settlement-view';
import type { SettlementList } from './types';

/** 내 샵의 기간 안 정산 내역, 합계, 다음 지급, 남은 패널티 */
export async function getSettlementItems(input: {
  shopId: string;
  from: string;
  to: string;
}): Promise<Result<SettlementList>> {
  const auth = await requireShopOwner(input?.shopId);
  if (!auth.ok) return auth;
  const occurred = parseSettlementPeriod(input.from, input.to);
  if (!occurred) return settlementFail('INVALID_PERIOD');

  const now = await getRequestNow();
  const db = getDb();
  const shopId = auth.data.shopId;
  const [rows, unpaidRows, outstandingPenalty] = await Promise.all([
    readShopSettlementRows(db, { shopId, occurred }),
    readShopSettlementRows(db, { shopId, unpaidOnly: true }),
    readOutstandingPenalty(db, shopId),
  ]);
  return ok(
    buildSettlementList({
      rows,
      unpaidRows,
      outstandingPenalty,
      now,
      paymentFeeRate: PAYMENT_FEE_RATE,
    }),
  );
}
