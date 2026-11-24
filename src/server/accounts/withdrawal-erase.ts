// 탈퇴 30일 뒤 개인정보 지우기 (#154 본문 4장). 서버에서만 부른다.
// 예약 작업(/api/cron/slot-digest)이 매일 오후 1시에 부른다(11/24, 새 예약 작업 대신 붙였다).
// 1) 되살리기 기간(30일)이 지난 탈퇴 기록마다 한 트랜잭션에서 개인정보를 지우고 탈퇴 기록을 끝낸다(같은 사람 표시는 이때 채운다).
//    파일(등록증·샵 사진)은 트랜잭션이 끝난 뒤 저장소에서 지운다. 실패하면 경고만 남긴다(등록증은 '안 쓰는 등록증 정리'가 다시 지운다).
// 2) 계정이 모두 탈퇴하고 끝나지 않은 탈퇴 기록도 없는 사람은 로그인 정보(Supabase 사용자)를 지운 뒤 이메일을 비운다((가), 11/23).
//    로그인 정보를 지우지 못하면 이메일을 남겨서 다음 날 다시 한다. 이미 없는 사용자면 지운 것으로 본다.
// 한 건이 실패해도 나머지는 한다. 로그에는 이메일·이름을 남기지 않는다

import 'server-only';

import type { getDb } from '@/db';
import { STORAGE_BUCKETS } from '@/server/storage/paths';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';
import { createSupabaseAdminClient } from '@/server/supabase/admin';

import { identityHashOf } from './identity';
import { fillIdentityHash } from './withdrawal-apply-store';
import {
  eraseCustomerData,
  eraseOwnerData,
  forgetProfileEmail,
  lockDueWithdrawal,
  readDueWithdrawals,
  readProfilesToForget,
} from './withdrawal-erase-store';

type Db = ReturnType<typeof getDb>;

const DAY_MS = 24 * 60 * 60 * 1000;
/** 한 번 실행에서 지우는 탈퇴 기록·로그인 정보 수(남으면 다음 날 이어서 한다) */
const ERASE_LIMIT = 200;

export type WithdrawalEraseSummary = {
  /** 개인정보를 지운 탈퇴 기록 수 */
  erased: number;
  failed: number;
  /** 저장소에서 지우지 못한 파일 수 */
  filesFailed: number;
  /** 로그인 정보를 지우고 이메일을 비운 사람 수 */
  forgotten: number;
  forgetFailed: number;
};

/** 저장소 파일 지우기와 로그인 정보 지우기. 테스트는 가짜를 넘긴다 */
export type EraseDeps = {
  /** 지우지 못한 파일 수를 돌려준다 */
  removeFiles: (bucket: string, paths: readonly string[]) => Promise<number>;
  /** 지웠거나 이미 없으면 true */
  deleteAuthUser: (userId: string) => Promise<boolean>;
};

async function removeFiles(bucket: string, paths: readonly string[]): Promise<number> {
  if (paths.length === 0) return 0;
  const { error } = await createSupabaseAdminClient()
    .storage.from(bucket)
    .remove([...paths]);
  if (!error) return 0;
  console.error('[withdrawal-erase] 파일 지우기 실패:', bucket, paths.length, error.message);
  return paths.length;
}

async function deleteAuthUser(userId: string): Promise<boolean> {
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (!error || error.status === 404) return true;
  console.error('[withdrawal-erase] 로그인 정보 지우기 실패:', error.status ?? error.name);
  return false;
}

const REAL_DEPS: EraseDeps = { removeFiles, deleteAuthUser };

/** 되살리기 기간이 지난 탈퇴 계정의 개인정보와, 모두 탈퇴한 사람의 로그인 정보를 지운다 */
export async function eraseWithdrawnAccounts(
  db: Db,
  now: Date,
  deps: EraseDeps = REAL_DEPS,
): Promise<WithdrawalEraseSummary> {
  const summary: WithdrawalEraseSummary = {
    erased: 0,
    failed: 0,
    filesFailed: 0,
    forgotten: 0,
    forgetFailed: 0,
  };
  const before = new Date(now.getTime() - WITHDRAWAL_RESTORE_DAYS * DAY_MS);
  const due = await readDueWithdrawals(db, { before, limit: ERASE_LIMIT });

  for (const withdrawal of due) {
    try {
      const files = await db.transaction(async (tx) => {
        const locked = await lockDueWithdrawal(tx, withdrawal.id);
        // 그 사이 되살렸거나 지웠다
        if (!locked) return null;
        const identityHash = identityHashOf(locked.email);
        if (identityHash) await fillIdentityHash(tx, { userId: withdrawal.userId, identityHash });
        if (withdrawal.customerId) {
          await eraseCustomerData(tx, {
            withdrawalId: withdrawal.id,
            customerId: withdrawal.customerId,
            now,
          });
          return { businessDocPaths: [], shopImagePaths: [] };
        }
        if (withdrawal.ownerId) {
          return eraseOwnerData(tx, {
            withdrawalId: withdrawal.id,
            ownerId: withdrawal.ownerId,
            now,
          });
        }
        // DB 제약(account_withdrawals_account_check)으로 생기지 않는다
        throw new Error('탈퇴 기록에 계정이 없어요');
      });
      if (!files) continue;
      summary.erased += 1;
      summary.filesFailed +=
        (await deps.removeFiles(STORAGE_BUCKETS.businessDocs, files.businessDocPaths)) +
        (await deps.removeFiles(STORAGE_BUCKETS.shopImages, files.shopImagePaths));
    } catch (error) {
      summary.failed += 1;
      console.error(
        '[withdrawal-erase] 개인정보 지우기 실패:',
        error instanceof Error ? error.name : 'unknown',
      );
    }
  }

  for (const { userId } of await readProfilesToForget(db, { limit: ERASE_LIMIT })) {
    try {
      if (!(await deps.deleteAuthUser(userId))) {
        summary.forgetFailed += 1;
        continue;
      }
      await forgetProfileEmail(db, userId);
      summary.forgotten += 1;
    } catch (error) {
      summary.forgetFailed += 1;
      console.error(
        '[withdrawal-erase] 로그인 정보 지우기 실패:',
        error instanceof Error ? error.name : 'unknown',
      );
    }
  }
  return summary;
}
