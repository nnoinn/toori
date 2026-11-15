'use server';

// 계정 이력 (#374, 11/13 nnoinn, AUTH-13). 원장님 내 계정의 계정 이력(정민석)과 운영자 회원 상세의 [이력 보기]가 부른다.
// 화면에서는 '@/server/accounts/history'에서 가져온다. 결과 모양은 './history-types', 화면 문구는 './history-texts'.
// - 원장님은 지금 들어온 원장님 계정의 샵 이력만 본다(계정 id를 받지 않는다)
// - 운영자는 원장님·고객 누구의 이력이든 보고, 볼 때마다 열람 기록(admin_access_logs)을 남긴다
// - 최신 순으로 한 쪽 20줄, 쪽 번호(page)로 넘긴다. 기간(from~to, 한국 날짜, 둘 다 포함)과 종류 묶음(category)으로
//   고를 수 있다(11/15 nnoinn)

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok, type Result } from '@/lib/result';
import { kstDateKey, kstToUtc } from '@/lib/time';
import { isUuid } from '@/lib/uuid';
import { recordAdminAccess } from '@/server/admin/access-log';
import { requireAdmin, requireOwner } from '@/server/auth';

import { clampHistoryPage, toHistoryPage } from './history-page';
import {
  type HistoryReadRange,
  readCustomerHistory,
  readCustomerUserId,
  readOwnerHistory,
  readOwnerShopId,
} from './history-store';
import {
  ACCOUNT_HISTORY_CATEGORIES,
  ACCOUNT_TYPES,
  type AccountHistoryPage,
  type AccountHistoryQuery,
  type AccountType,
  HISTORY_CATEGORY_KINDS,
  HISTORY_PAGE_SIZE,
} from './history-types';

const HISTORY_ERRORS = {
  INVALID_INPUT: '이력을 다시 불러와 주세요',
  INVALID_PERIOD: '기간을 다시 골라 주세요. 시작일이 끝일보다 늦어요',
  ACCOUNT_NOT_FOUND: '계정을 찾을 수 없어요',
} as const;
type HistoryError = keyof typeof HISTORY_ERRORS;

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 한국 날짜 'YYYY-MM-DD'의 0시(UTC Date). 모양이 틀리거나 없는 날짜(2026-02-30)면 null */
function kstDayStart(date: unknown): Date | null {
  if (typeof date !== 'string' || !DATE_PATTERN.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const start = kstToUtc({ year, month, day, hour: 0, minute: 0 });
  return kstDateKey(start) === date ? start : null;
}

type ReadQuery =
  | { ok: true; page: number; range: Omit<HistoryReadRange, 'take'> }
  | { ok: false; error: HistoryError };

/** 쪽 번호·기간·종류 묶음을 읽는다. 종류 묶음은 그 계정 종류의 것만 받는다 */
function readQuery(query: AccountHistoryQuery, accountType: AccountType): ReadQuery {
  const from = query.from === undefined ? null : kstDayStart(query.from);
  const toStart = query.to === undefined ? null : kstDayStart(query.to);
  if ((query.from !== undefined && !from) || (query.to !== undefined && !toStart)) {
    return { ok: false, error: 'INVALID_INPUT' };
  }
  if (from && toStart && from > toStart) return { ok: false, error: 'INVALID_PERIOD' };
  const { category } = query;
  if (category !== undefined && !ACCOUNT_HISTORY_CATEGORIES[accountType].includes(category)) {
    return { ok: false, error: 'INVALID_INPUT' };
  }
  return {
    ok: true,
    page: clampHistoryPage(typeof query.page === 'number' ? query.page : undefined),
    range: {
      from,
      // 끝일은 그날 하루를 다 넣는다(다음 날 0시 전까지)
      before: toStart ? new Date(toStart.getTime() + DAY_MS) : null,
      kinds: category ? HISTORY_CATEGORY_KINDS[category] : null,
    },
  };
}

/** 원장님: 지금 들어온 원장님 계정(그 샵)의 이력 */
export async function getOwnerAccountHistory(
  query: AccountHistoryQuery = {},
): Promise<Result<AccountHistoryPage>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  const parsed = readQuery(query ?? {}, 'owner');
  if (!parsed.ok) return fail(parsed.error, HISTORY_ERRORS[parsed.error]);
  const lists = await readOwnerHistory(getDb(), {
    shopId: auth.data.shopId,
    now: await getRequestNow(),
    ...parsed.range,
    take: parsed.page * HISTORY_PAGE_SIZE,
  });
  return ok(toHistoryPage(lists, parsed.page, HISTORY_PAGE_SIZE));
}

/** 운영자: 원장님(owners.id)·고객(customers.id) 계정의 이력. 볼 때마다 열람 기록을 남긴다 */
export async function getAdminAccountHistory(
  input: AccountHistoryQuery & { accountType: AccountType; accountId: string },
): Promise<Result<AccountHistoryPage>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!ACCOUNT_TYPES.includes(input?.accountType)) {
    return fail('INVALID_INPUT', HISTORY_ERRORS.INVALID_INPUT);
  }
  const { accountType, accountId } = input;
  const parsed = readQuery(input, accountType);
  if (!parsed.ok) return fail(parsed.error, HISTORY_ERRORS[parsed.error]);
  if (!isUuid(accountId)) return fail('ACCOUNT_NOT_FOUND', HISTORY_ERRORS.ACCOUNT_NOT_FOUND);

  const db = getDb();
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

  const range = { ...parsed.range, take: parsed.page * HISTORY_PAGE_SIZE };
  const lists =
    'shopId' in target
      ? await readOwnerHistory(db, { shopId: target.shopId, now: await getRequestNow(), ...range })
      : await readCustomerHistory(db, { customerId: accountId, userId: target.userId, ...range });
  return ok(toHistoryPage(lists, parsed.page, HISTORY_PAGE_SIZE));
}
