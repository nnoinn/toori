'use server';

// 회원 탈퇴·되살리기 (#154, 고객 C-106·원장님 탈퇴). 고객 내 정보 > [회원 탈퇴]·[계정 되살리기](정찬형)와
// 원장님 매장 설정 > [원장님 탈퇴]·[계정 되살리기](정민석)에서 부른다. 화면에서는 '@/server/accounts/withdrawal'에서 가져온다.
// 값의 모양은 ./withdrawal-types, 막힌 이유 문구는 withdrawalBlockerText(./withdrawal-texts), 실패 문구는 ./withdrawal-errors.
//
// 지금은 가짜 결과 버전이다(DB 구조 0023 승인 전).
// - 진짜: 로그인·계정 확인, 탈퇴를 막는 이유 계산(지금 있는 예약·매물·이의제기·쿠폰·정산·패널티로 센다)
// - 가짜: 탈퇴·되살리기는 저장하지 않는다. 로컬 스위치(DEV_FAKE_WITHDRAWAL, ./withdrawal-fake)를 켜면 성공 모양을 주고,
//   꺼진 곳(배포 주소)에서는 NOT_OPEN "회원 탈퇴는 곧 열려요"로 끝난다. 저장하지 않으면서 성공을 돌려주지 않는다.
//   진짜 버전은 한 트랜잭션에서 처리하고 로그아웃까지 한다(#154 2장). 화면은 성공하면 첫 화면으로 보낸다

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { fail, ok } from '@/lib/result';
import { AUTH_ERRORS, getCurrentAccount, requireCustomer, requireOwner } from '@/server/auth';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';

import { type WithdrawalResult, withdrawalFail } from './withdrawal-errors';
import {
  FAKE_CUSTOMER_BLOCKERS,
  FAKE_OWNER_BLOCKERS,
  FAKE_WITHDRAWN_DAYS_AGO,
  fakeWithdrawalFailure,
  fakeWithdrawalMode,
} from './withdrawal-fake';
import {
  customerWithdrawalBlockers,
  ownerWithdrawalBlockers,
  restorableUntil,
} from './withdrawal-rules';
import { readCustomerWithdrawalFacts, readOwnerWithdrawalFacts } from './withdrawal-store';
import type {
  CustomerWithdrawalCheck,
  OwnerWithdrawalCheck,
  RestorableAccount,
  RestoredAccount,
  WithdrawnAccount,
  WithdrawnOwnerAccount,
} from './withdrawal-types';

const DAY_MS = 24 * 60 * 60 * 1000;

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

/**
 * 고객 탈퇴(확인 창 두 번 뒤). 막는 이유를 서버에서 다시 보고, 있으면 WITHDRAWAL_BLOCKED(error.blockers에 이유 모두).
 * 진짜 버전: 결제 중이면 홀딩을 풀고, 안 쓴 쿠폰을 없애고, 관심 동네·찜·웹 푸시 구독을 지우고, 광고성 동의 철회를 남긴 뒤 로그아웃한다
 */
export async function withdrawCustomer(): Promise<WithdrawalResult<WithdrawnAccount>> {
  const checked = await checkCustomer();
  if (!checked.ok) return checked;
  const { check, now } = checked.data;
  if (check.blockers.length > 0) {
    return withdrawalFail('WITHDRAWAL_BLOCKED', { blockers: check.blockers });
  }
  const switched = fakeWithdrawalFailure('withdrawCustomer');
  if (switched) return switched;
  if (fakeWithdrawalMode() !== 'on') return withdrawalFail('NOT_OPEN');
  return ok({
    withdrawnAt: now.toISOString(),
    restorableUntil: restorableUntil(now, WITHDRAWAL_RESTORE_DAYS).toISOString(),
  });
}

/**
 * 원장님 탈퇴(확인 창 두 번 뒤). 막는 이유를 서버에서 다시 보고, 있으면 WITHDRAWAL_BLOCKED(error.blockers에 이유 모두).
 * 진짜 버전: 판매 전 매물·시간대를 일괄 마감(account_withdrawal)하고, 샵을 탈퇴(withdrawn)로 바꾸고, 웹 푸시 구독을 지운 뒤 로그아웃한다
 */
export async function withdrawOwner(): Promise<WithdrawalResult<WithdrawnOwnerAccount>> {
  const checked = await checkOwner();
  if (!checked.ok) return checked;
  const { check, now } = checked.data;
  if (check.blockers.length > 0) {
    return withdrawalFail('WITHDRAWAL_BLOCKED', { blockers: check.blockers });
  }
  const switched = fakeWithdrawalFailure('withdrawOwner');
  if (switched) return switched;
  if (fakeWithdrawalMode() !== 'on') return withdrawalFail('NOT_OPEN');
  return ok({
    withdrawnAt: now.toISOString(),
    restorableUntil: restorableUntil(now, WITHDRAWAL_RESTORE_DAYS).toISOString(),
    closedSlotCount: check.openSlotCount,
  });
}

/**
 * 로그인 뒤 고른 계정 종류(mode)가 되살리기 기간 안에 탈퇴한 계정이면 그 정보, 아니면 null.
 * 되살리기 화면이 부른다(진짜 버전은 로그인 콜백이 30일 안이면 새 가입 대신 이 화면으로 보낸다).
 * 가짜 버전: 스위치를 켜면 늘 "3일 전에 탈퇴한 계정", 꺼져 있으면 null
 */
export async function getRestorableAccount(
  mode: 'customer' | 'owner',
): Promise<WithdrawalResult<RestorableAccount | null>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  if (mode !== 'customer' && mode !== 'owner') return withdrawalFail('INVALID_INPUT');
  if (fakeWithdrawalMode() !== 'on') return ok(null);
  const now = await getRequestNow();
  const withdrawnAt = new Date(now.getTime() - FAKE_WITHDRAWN_DAYS_AGO * DAY_MS);
  return ok({
    withdrawnAt: withdrawnAt.toISOString(),
    restorableUntil: restorableUntil(withdrawnAt, WITHDRAWAL_RESTORE_DAYS).toISOString(),
  });
}

/** [계정 되살리기] 실패·성공 공통. 로그인만 확인한다(탈퇴한 계정은 계정 확인 함수를 통과하지 못한다) */
async function restore(
  fn: 'restoreCustomer' | 'restoreOwner',
): Promise<WithdrawalResult<RestoredAccount>> {
  const account = await getCurrentAccount();
  if (!account) return fail('UNAUTHENTICATED', AUTH_ERRORS.UNAUTHENTICATED);
  const switched = fakeWithdrawalFailure(fn);
  if (switched) return switched;
  if (fakeWithdrawalMode() !== 'on') return withdrawalFail('NOT_OPEN');
  return ok({ restoredAt: (await getRequestNow()).toISOString() });
}

/**
 * 고객 [계정 되살리기]. 진짜 버전: 탈퇴한 고객 계정을 되살린다(이력 그대로, 없어진 쿠폰은 돌아오지 않는다).
 * 그 계정 종류로 탈퇴한 계정이 없으면 NOT_WITHDRAWN, 되살리기 기간이 지났으면 RESTORE_EXPIRED
 */
export async function restoreCustomer(): Promise<WithdrawalResult<RestoredAccount>> {
  return restore('restoreCustomer');
}

/**
 * 원장님 [계정 되살리기]. 진짜 버전: 샵을 탈퇴 전 상태(보통 승인)로 돌린다(일괄 마감한 매물은 돌아오지 않는다).
 * 그 계정 종류로 탈퇴한 계정이 없으면 NOT_WITHDRAWN, 되살리기 기간이 지났으면 RESTORE_EXPIRED
 */
export async function restoreOwner(): Promise<WithdrawalResult<RestoredAccount>> {
  return restore('restoreOwner');
}
