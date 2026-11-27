'use server';

// 회원 탈퇴·되살리기 (#154, 고객 C-106·원장님 탈퇴). 고객 내 정보 > [회원 탈퇴]·[계정 되살리기](정찬형)와
// 원장님 매장 설정 > [원장님 탈퇴]·[계정 되살리기](정민석)에서 부른다. 화면에서는 '@/server/accounts/withdrawal'에서 가져온다.
// 값의 모양은 ./withdrawal-types, 막힌 이유 문구는 withdrawalBlockerText(./withdrawal-texts), 실패 문구는 ./withdrawal-errors.
//
// - 탈퇴 처리: 한 트랜잭션에서 처리하고 로그아웃까지 한다(#154 2장). 화면은 성공하면 첫 화면으로 보낸다
// - 되살리기(#154 3장): 30일 안에 같은 로그인으로 그 계정 종류에 들어오면 로그인 콜백은 지금처럼 가입 화면으로 보내고(11/24),
//   가입 화면이 getRestorableAccount로 되살리기를 안내한다. 가입 함수는 그동안 WITHDRAWN_RESTORABLE로 막는다
// - DEV_FAKE_WITHDRAWAL=blocked(로컬만, ./withdrawal-fake)는 탈퇴 확인과 탈퇴 처리가 막는 이유를 모두 준다(막힌 화면 확인용)

import { cookies } from 'next/headers';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok } from '@/lib/result';
import { AUTH_ERRORS, getCurrentAccount, requireCustomer, requireOwner } from '@/server/auth';
import { ACCOUNT_MODE_COOKIE, ACCOUNT_MODE_COOKIE_OPTIONS } from '@/server/auth/account-mode';
import { signOut } from '@/server/auth/session';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';

import { identityHashOf, identityHashRequired } from './identity';
import {
  applyCustomerWithdrawal,
  applyOwnerWithdrawal,
  closeShopOpenSlots,
  fillIdentityHash,
  lockActiveCustomer,
  lockActiveOwnerShop,
} from './withdrawal-apply-store';

import { type WithdrawalResult, withdrawalFail } from './withdrawal-errors';
import { FAKE_CUSTOMER_BLOCKERS, FAKE_OWNER_BLOCKERS, fakeWithdrawalMode } from './withdrawal-fake';
import {
  customerWithdrawalBlockers,
  ownerWithdrawalBlockers,
  restorableUntil,
} from './withdrawal-rules';
import {
  hasActiveAccount,
  lockOpenWithdrawal,
  readOpenWithdrawal,
  restoreCustomerAccount,
  restoreOwnerAccount,
  type WithdrawalAccountType,
} from './withdrawal-restore-store';
import { readCustomerWithdrawalFacts, readOwnerWithdrawalFacts } from './withdrawal-store';
import type {
  CustomerWithdrawalCheck,
  OwnerWithdrawalCheck,
  RestorableAccount,
  RestoredAccount,
  WithdrawalBlocker,
  WithdrawnAccount,
  WithdrawnOwnerAccount,
} from './withdrawal-types';

/** 고객 탈퇴 확인: 막는 이유와 확인 창에 보여 줄 값. 지금 고객 계정만 */
async function checkCustomer() {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  const now = await getRequestNow();
  const facts = await readCustomerWithdrawalFacts(getDb(), auth.data.customerId, now);
  const check: CustomerWithdrawalCheck = {
    blockers:
      fakeWithdrawalMode() === 'blocked'
        ? FAKE_CUSTOMER_BLOCKERS
        : customerWithdrawalBlockers(facts),
    unusedCouponCount: facts.unusedCoupons,
    holding: facts.holding,
    restoreDays: WITHDRAWAL_RESTORE_DAYS,
  };
  return ok({ check, now });
}

/** 원장님 탈퇴 확인: 막는 이유와 일괄 마감할 매물 수. 지금 원장님 계정의 샵만 */
async function checkOwner() {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  const now = await getRequestNow();
  const facts = await readOwnerWithdrawalFacts(getDb(), auth.data.shopId, now);
  const check: OwnerWithdrawalCheck = {
    blockers:
      fakeWithdrawalMode() === 'blocked' ? FAKE_OWNER_BLOCKERS : ownerWithdrawalBlockers(facts),
    openSlotCount: facts.openSlotCount,
    restoreDays: WITHDRAWAL_RESTORE_DAYS,
  };
  return ok({ check, now });
}

/** 고객 [회원 탈퇴] 화면을 열 때. 막는 이유가 있으면 모두 보여 주고, 없으면 확인 창(쿠폰 N장이 없어져요)을 연다 */
export async function getCustomerWithdrawalCheck(): Promise<
  WithdrawalResult<CustomerWithdrawalCheck>
> {
  const checked = await checkCustomer();
  return checked.ok ? ok(checked.data.check) : checked;
}

/** 원장님 [원장님 탈퇴] 화면을 열 때. 막는 이유가 있으면 모두 보여 주고, 없으면 확인 창(매물 N개를 일괄 마감해요)을 연다 */
export async function getOwnerWithdrawalCheck(): Promise<WithdrawalResult<OwnerWithdrawalCheck>> {
  const checked = await checkOwner();
  return checked.ok ? ok(checked.data.check) : checked;
}

/** 원장님 탈퇴에서 매물을 마감하는 사이 손님이 결제를 시작했을 때 트랜잭션을 되돌리려고 던진다 */
class BlockedDuringWithdrawal extends Error {
  constructor(readonly blockers: WithdrawalBlocker[]) {
    super('WITHDRAWAL_BLOCKED');
  }
}

/** 탈퇴가 저장된 뒤 로그아웃한다. 로그아웃이 실패해도 탈퇴는 끝났다(계정 확인 함수가 탈퇴한 계정을 통과시키지 않는다) */
async function signOutAfterWithdrawal() {
  const signedOut = await signOut();
  if (!signedOut.ok) console.error('[withdrawal] 탈퇴 뒤 로그아웃 실패:', signedOut.error.code);
}

function withdrawnResult(now: Date): WithdrawnAccount {
  return {
    withdrawnAt: now.toISOString(),
    restorableUntil: restorableUntil(now, WITHDRAWAL_RESTORE_DAYS).toISOString(),
  };
}

/**
 * 고객 탈퇴(확인 창 두 번 뒤). 한 트랜잭션에서 고객 계정 줄을 잠그고 막는 이유를 다시 센다.
 * 있으면 WITHDRAWAL_BLOCKED(error.blockers에 이유 모두). 없으면 결제 중이면 홀딩을 풀고, 안 쓴 쿠폰을 없애고,
 * 관심 동네·관심 샵·관심 매물·웹 푸시 구독을 지우고, 광고성 동의 철회를 남기고, 같은 사람 표시를 채운 뒤 로그아웃한다.
 * 운영 배포에서 같은 사람 표시 키가 없으면 NOT_READY(아무것도 바꾸지 않는다)
 */
export async function withdrawCustomer(): Promise<WithdrawalResult<WithdrawnAccount>> {
  const auth = await requireCustomer();
  if (!auth.ok) return auth;
  if (fakeWithdrawalMode() === 'blocked') {
    return withdrawalFail('WITHDRAWAL_BLOCKED', { blockers: FAKE_CUSTOMER_BLOCKERS });
  }
  const { customerId } = auth.data;
  const now = await getRequestNow();

  const result = await getDb().transaction(
    async (tx): Promise<WithdrawalResult<WithdrawnAccount>> => {
      const locked = await lockActiveCustomer(tx, customerId);
      if (!locked) return fail('NO_CUSTOMER_ACCOUNT', AUTH_ERRORS.NO_CUSTOMER_ACCOUNT);
      const blockers = customerWithdrawalBlockers(
        await readCustomerWithdrawalFacts(tx, customerId, now),
      );
      if (blockers.length > 0) return withdrawalFail('WITHDRAWAL_BLOCKED', { blockers });
      const identityHash = identityHashOf(locked.email);
      if (!identityHash) {
        if (identityHashRequired()) return withdrawalFail('NOT_READY');
        console.warn('[withdrawal] ACCOUNT_IDENTITY_KEY가 없어 같은 사람 표시 없이 탈퇴해요');
      }

      await applyCustomerWithdrawal(tx, { customerId, userId: locked.userId, now });
      if (identityHash) await fillIdentityHash(tx, { userId: locked.userId, identityHash });
      return ok(withdrawnResult(now));
    },
  );
  if (result.ok) await signOutAfterWithdrawal();
  return result;
}

/**
 * 원장님 탈퇴(확인 창 두 번 뒤). 한 트랜잭션에서 원장님 계정과 샵 줄을 잠그고 막는 이유를 다시 센다.
 * 있으면 WITHDRAWAL_BLOCKED(error.blockers에 이유 모두). 없으면 판매 전 매물·시간대를 일괄 마감(account_withdrawal)하고,
 * 마감하는 사이 손님이 결제를 시작했으면 모두 되돌리고 WITHDRAWAL_BLOCKED. 이어서 샵을 탈퇴(withdrawn)로 바꾸고,
 * 웹 푸시 구독을 지우고, 같은 사람 표시를 채운 뒤 로그아웃한다. 운영 배포에서 같은 사람 표시 키가 없으면 NOT_READY
 */
export async function withdrawOwner(): Promise<WithdrawalResult<WithdrawnOwnerAccount>> {
  const auth = await requireOwner();
  if (!auth.ok) return auth;
  if (fakeWithdrawalMode() === 'blocked') {
    return withdrawalFail('WITHDRAWAL_BLOCKED', { blockers: FAKE_OWNER_BLOCKERS });
  }
  const { ownerId, shopId } = auth.data;
  const now = await getRequestNow();

  let result: WithdrawalResult<WithdrawnOwnerAccount>;
  try {
    result = await getDb().transaction(
      async (tx): Promise<WithdrawalResult<WithdrawnOwnerAccount>> => {
        const locked = await lockActiveOwnerShop(tx, { ownerId, shopId });
        if (!locked) return fail('NO_OWNER_ACCOUNT', AUTH_ERRORS.NO_OWNER_ACCOUNT);
        const blockers = ownerWithdrawalBlockers(await readOwnerWithdrawalFacts(tx, shopId, now));
        if (blockers.length > 0) return withdrawalFail('WITHDRAWAL_BLOCKED', { blockers });
        const identityHash = identityHashOf(locked.email);
        if (!identityHash) {
          if (identityHashRequired()) return withdrawalFail('NOT_READY');
          console.warn('[withdrawal] ACCOUNT_IDENTITY_KEY가 없어 같은 사람 표시 없이 탈퇴해요');
        }

        const closedSlotCount = await closeShopOpenSlots(tx, { shopId, now });
        // 마감하는 사이(잠그기 전에 시작한 [예약하기]) 손님이 결제를 시작했으면 마감까지 모두 되돌린다
        const after = ownerWithdrawalBlockers(await readOwnerWithdrawalFacts(tx, shopId, now));
        if (after.length > 0) throw new BlockedDuringWithdrawal(after);

        await applyOwnerWithdrawal(tx, {
          ownerId,
          shopId,
          userId: locked.userId,
          shopStatusBefore: locked.shopStatus,
          closedSlotCount,
          now,
        });
        if (identityHash) await fillIdentityHash(tx, { userId: locked.userId, identityHash });
        return ok({ ...withdrawnResult(now), closedSlotCount });
      },
    );
  } catch (error) {
    if (error instanceof BlockedDuringWithdrawal) {
      return withdrawalFail('WITHDRAWAL_BLOCKED', { blockers: error.blockers });
    }
    throw error;
  }
  if (result.ok) await signOutAfterWithdrawal();
  return result;
}

/**
 * 로그인 뒤 고른 계정 종류(mode)가 되살리기 기간 안에 탈퇴한 계정이면 그 정보, 아니면 null.
 * 그 계정 종류의 탈퇴하지 않은 계정이 있거나, 탈퇴한 지 기간이 지났으면 null이다.
 * 가입 화면(고객 /join, 원장님 /owner/join)이 불러서 null이 아니면 새 가입 대신 [계정 되살리기]를 안내한다
 */
export async function getRestorableAccount(
  mode: 'customer' | 'owner',
): Promise<WithdrawalResult<RestorableAccount | null>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  if (mode !== 'customer' && mode !== 'owner') return withdrawalFail('INVALID_INPUT');
  const db = getDb();
  const input = { userId: account.userId, accountType: mode };
  if (await hasActiveAccount(db, input)) return ok(null);
  const open = await readOpenWithdrawal(db, input);
  if (!open) return ok(null);
  const now = await getRequestNow();
  const until = restorableUntil(open.withdrawnAt, WITHDRAWAL_RESTORE_DAYS);
  if (now >= until) return ok(null);
  return ok({ withdrawnAt: open.withdrawnAt.toISOString(), restorableUntil: until.toISOString() });
}

/**
 * [계정 되살리기] 공통. 로그인만 확인한다(탈퇴한 계정은 계정 확인 함수를 통과하지 못한다).
 * 한 트랜잭션에서 그 계정 종류의 탈퇴 기록을 잠그고, 없거나 이미 탈퇴하지 않은 계정이 있으면 NOT_WITHDRAWN,
 * 기간이 지났으면 RESTORE_EXPIRED. 되살리면 그 계정 종류로 계정 모드를 맞춘다
 */
async function restore(
  accountType: WithdrawalAccountType,
): Promise<WithdrawalResult<RestoredAccount>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const now = await getRequestNow();
  const input = { userId: account.userId, accountType };

  const result = await getDb().transaction(
    async (tx): Promise<WithdrawalResult<RestoredAccount>> => {
      const open = await lockOpenWithdrawal(tx, input);
      if (!open || (await hasActiveAccount(tx, input))) return withdrawalFail('NOT_WITHDRAWN');
      if (now >= restorableUntil(open.withdrawnAt, WITHDRAWAL_RESTORE_DAYS)) {
        return withdrawalFail('RESTORE_EXPIRED');
      }
      if (accountType === 'customer' && open.customerId) {
        await restoreCustomerAccount(tx, {
          withdrawalId: open.id,
          customerId: open.customerId,
          now,
        });
      } else if (accountType === 'owner' && open.ownerId && open.shopStatusBefore) {
        await restoreOwnerAccount(tx, {
          withdrawalId: open.id,
          ownerId: open.ownerId,
          shopStatusBefore: open.shopStatusBefore,
          now,
        });
      } else {
        // DB 제약(account_withdrawals_account_check)으로 생기지 않는다
        return withdrawalFail('NOT_WITHDRAWN');
      }
      return ok({ restoredAt: now.toISOString() });
    },
  );
  if (result.ok) {
    (await cookies()).set(ACCOUNT_MODE_COOKIE, accountType, ACCOUNT_MODE_COOKIE_OPTIONS);
  }
  return result;
}

/**
 * 고객 [계정 되살리기]. 탈퇴한 고객 계정을 되살린다(이력 그대로). 없어진 쿠폰, 철회한 광고성 동의, 지운 관심 동네·관심 샵·관심 매물·푸시 구독은
 * 돌아오지 않는다(#154 3장). 탈퇴한 계정이 없으면 NOT_WITHDRAWN, 되살리기 기간이 지났으면 RESTORE_EXPIRED
 */
export async function restoreCustomer(): Promise<WithdrawalResult<RestoredAccount>> {
  return restore('customer');
}

/**
 * 원장님 [계정 되살리기]. 샵을 탈퇴 전 상태(보통 승인)로 돌린다. 일괄 마감한 매물과 지운 푸시 구독은 돌아오지 않는다.
 * 탈퇴한 계정이 없으면 NOT_WITHDRAWN, 되살리기 기간이 지났으면 RESTORE_EXPIRED
 */
export async function restoreOwner(): Promise<WithdrawalResult<RestoredAccount>> {
  return restore('owner');
}
