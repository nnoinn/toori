'use server';

// 계정 이력 (#374, 11/13 nnoinn, AUTH-13). 원장님 내 계정의 계정 이력(정민석)과 운영자 회원 상세의 [이력 보기]가 부른다.
// 화면에서는 '@/server/accounts/history'에서 가져온다. 결과 모양은 './history-types', 화면 문구는 './history-texts'.
// - 원장님은 지금 들어온 원장님 계정의 샵 이력만 본다(계정 id를 받지 않는다)
// - 운영자는 원장님·고객 누구의 이력이든 보고, 볼 때마다 열람 기록(admin_access_logs)을 남긴다
// - 최신 순으로 limit개(기본 30, 최대 100). [더보기]는 nextBefore를 before로 넘긴다

import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type Result } from '@/lib/result';
import { isUuid } from '@/lib/uuid';
import { recordAdminAccess } from '@/server/admin/access-log';
import { requireAdmin, requireOwner } from '@/server/auth';

import { clampHistoryLimit, type HistoryReader, readHistoryPage } from './history-page';
import {
  readCustomerHistory,
  readCustomerUserId,
  readOwnerHistory,
  readOwnerShopId,
} from './history-store';
import { ACCOUNT_TYPES, type AccountHistoryPage, type AccountType } from './history-types';

const HISTORY_ERRORS = {
  INVALID_INPUT: '이력을 다시 불러와 주세요',
  ACCOUNT_NOT_FOUND: '계정을 찾을 수 없어요',
} as const;

const beforeSchema = z.iso.datetime({ offset: true }).optional();

/** before(ISO)와 limit을 읽는다. before 모양이 틀리면 null */
function readPaging(input: { before?: string; limit?: number } | undefined) {
  const before = beforeSchema.safeParse(input?.before);
  if (!before.success) return null;
  return {
    before: before.data ? new Date(before.data) : null,
    limit: clampHistoryLimit(input?.limit),
  };
}

/** 원장님: 지금 들어온 원장님 계정(그 샵)의 이력 */
export async function getOwnerAccountHistory(
  input: { before?: string; limit?: number } = {},
): Promise<Result<AccountHistoryPage>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  const paging = readPaging(input);
  if (!paging) return fail('INVALID_INPUT', HISTORY_ERRORS.INVALID_INPUT);
  const db = getDb();
  const { shopId } = auth.data;
  const now = await getRequestNow();
  return ok(
    await readHistoryPage(
      (range) => readOwnerHistory(db, { shopId, ...range, now }),
      paging.before,
      paging.limit,
    ),
  );
}

/** 운영자: 원장님(owners.id)·고객(customers.id) 계정의 이력. 볼 때마다 열람 기록을 남긴다 */
export async function getAdminAccountHistory(input: {
  accountType: AccountType;
  accountId: string;
  before?: string;
  limit?: number;
}): Promise<Result<AccountHistoryPage>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const paging = readPaging(input);
  if (!paging || !ACCOUNT_TYPES.includes(input?.accountType)) {
    return fail('INVALID_INPUT', HISTORY_ERRORS.INVALID_INPUT);
  }
  if (!isUuid(input.accountId)) return fail('ACCOUNT_NOT_FOUND', HISTORY_ERRORS.ACCOUNT_NOT_FOUND);

  const db = getDb();
  const { accountType, accountId } = input;
  const target =
    accountType === 'owner'
      ? await readOwnerShopId(db, accountId).then((shopId) => (shopId ? { shopId } : null))
      : await readCustomerUserId(db, accountId).then((userId) => (userId ? { userId } : null));
  if (!target) return fail('ACCOUNT_NOT_FOUND', HISTORY_ERRORS.ACCOUNT_NOT_FOUND);

  // 이력에는 예약·환불·동의 기록이 보여서 회원 상세처럼 열람 기록을 남긴다(기록을 못 남기면 오류로 끝난다)
  await recordAdminAccess(auth.data.userId, {
    action: 'view',
    targetType: accountType,
    targetId: accountId,
    path: `/admin/users/${accountType}s/${accountId}/history`,
  });

  let read: HistoryReader;
  if ('shopId' in target) {
    const { shopId } = target;
    const now = await getRequestNow();
    read = (range) => readOwnerHistory(db, { shopId, ...range, now });
  } else {
    const { userId } = target;
    read = (range) => readCustomerHistory(db, { customerId: accountId, userId, ...range });
  }
  return ok(await readHistoryPage(read, paging.before, paging.limit));
}
