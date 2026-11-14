'use server';

// 원장님 정산서 (S-501, 연결 #10, #129 2장, W20 ③-2). 정민석 정산 화면(O15)에서 부른다.
// 화면에서는 '@/server/settlements/get-settlement-statements'에서 가져온다. 결과 모양은 './types'.
// 본인 샵만 본다. 지급일 하나에 한 장이고, 아직 묶이지 않은 지급 예정도 같은 모양으로 보여준다.

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ok, type Result } from '@/lib/result';
import { requireShopOwner } from '@/server/auth';
import { PAYMENT_FEE_RATE } from '@/server/policy';

import { settlementFail } from './errors';
import { readShopSettlementRows } from './settlement-store';
import { parseSettlementPeriod, toSettlementItemViews } from './settlement-view';
import {
  readLastPayoutDate,
  readPayoutAccount,
  readPenaltyCollections,
  readShopSettlements,
  readUnpaidPenalties,
} from './statement-store';
import { buildStatementList, scheduledStatement, storedStatement } from './statement-view';
import type { SettlementStatement, SettlementStatementList } from './types';

/**
 * 내 샵의 정산서 목록. 기간은 지급일 기준 한국 날짜(시작일·끝일 포함, 최대 366일).
 * 이의제기로 보류 중인 거래, 남은 패널티, 정산 계좌를 같이 준다
 */
export async function getSettlementStatements(input: {
  shopId: string;
  from: string;
  to: string;
}): Promise<Result<SettlementStatementList>> {
  const auth = await requireShopOwner(input?.shopId);
  if (!auth.ok) return auth;
  if (!parseSettlementPeriod(input.from, input.to)) return settlementFail('INVALID_PERIOD');

  const now = await getRequestNow();
  const db = getDb();
  const shopId = auth.data.shopId;
  const [stored, unpaidRows, penalties, lastPayoutDate, payoutAccount] = await Promise.all([
    readShopSettlements(db, { shopId, from: input.from, to: input.to }),
    readShopSettlementRows(db, { shopId, unpaidOnly: true }),
    readUnpaidPenalties(db, shopId),
    readLastPayoutDate(db, shopId),
    readPayoutAccount(db, shopId),
  ]);
  return ok(
    buildStatementList({
      stored,
      unpaidItems: toSettlementItemViews(unpaidRows, { now, paymentFeeRate: PAYMENT_FEE_RATE }),
      lastPayoutDate,
      penalties,
      payoutAccount,
      period: { from: input.from, to: input.to },
      now,
    }),
  );
}

const payoutDateSchema = z.iso.date();

/** 내 샵의 정산서 한 장(그 지급일의 거래와 뗀 패널티). 없으면 STATEMENT_NOT_FOUND */
export async function getSettlementStatement(input: {
  shopId: string;
  payoutDate: string;
}): Promise<Result<SettlementStatement>> {
  const auth = await requireShopOwner(input?.shopId);
  if (!auth.ok) return auth;
  const payoutDate = payoutDateSchema.safeParse(input.payoutDate);
  if (!payoutDate.success) return settlementFail('STATEMENT_NOT_FOUND');

  const now = await getRequestNow();
  const db = getDb();
  const shopId = auth.data.shopId;
  const options = { now, paymentFeeRate: PAYMENT_FEE_RATE };
  const [[stored], payoutAccount] = await Promise.all([
    readShopSettlements(db, { shopId, payoutDate: payoutDate.data }),
    readPayoutAccount(db, shopId),
  ]);

  if (stored) {
    const [rows, penalties] = await Promise.all([
      readShopSettlementRows(db, { shopId, settlementId: stored.id }),
      readPenaltyCollections(db, [stored.id]),
    ]);
    return ok(
      storedStatement({
        stored,
        items: toSettlementItemViews(rows, options),
        penalties: penalties.map(({ reservationCode, amount }) => ({ reservationCode, amount })),
        payoutAccount,
      }),
    );
  }

  const [unpaidRows, penalties, lastPayoutDate] = await Promise.all([
    readShopSettlementRows(db, { shopId, unpaidOnly: true }),
    readUnpaidPenalties(db, shopId),
    readLastPayoutDate(db, shopId),
  ]);
  const scheduled = scheduledStatement({
    payoutDate: payoutDate.data,
    unpaidItems: toSettlementItemViews(unpaidRows, options),
    lastPayoutDate,
    penalties,
    payoutAccount,
  });
  return scheduled ? ok(scheduled) : settlementFail('STATEMENT_NOT_FOUND');
}
