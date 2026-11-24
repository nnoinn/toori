import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoadingCards } from '@/components/ui/state';
import { getCurrentAccount } from '@/server/auth';
import { OWNER_JOIN_PATH } from '@/server/auth/paths';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';

import { readOwnerRestorable } from './read-restorable';
import { OwnerRestoreForm } from './restore-form';
import { ownerEntryRedirect, restoreDates, restoreDescription } from './restore-rules';

export const metadata: Metadata = { title: '계정 되살리기' };

// 원장님 계정 되살리기 (#154 3장). 탈퇴한 지 30일 안에 같은 로그인으로 원장님 모드에 들어오면 가입 화면이 이리로 보낸다.
// 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장)
export default function OwnerRestorePage() {
  return (
    <Suspense fallback={<LoadingCards count={1} />}>
      <OwnerRestoreContent />
    </Suspense>
  );
}

async function OwnerRestoreContent() {
  // proxy가 먼저 막지만(원장님 모드로 로그인해야 들어옴) 한 번 더 확인한다.
  // 이미 원장님 계정이 있으면 원장님 화면으로, 되살릴 계정이 없으면 가입 화면으로
  const account = await getCurrentAccount();
  const restorable = await readOwnerRestorable(account);
  const to = ownerEntryRedirect('restore', account, restorable);
  if (to !== null || restorable === null) redirect(to ?? OWNER_JOIN_PATH);

  const dates = restoreDates(restorable);
  return (
    <OwnerRestoreForm
      description={restoreDescription(WITHDRAWAL_RESTORE_DAYS)}
      withdrawnAt={dates.withdrawnAt}
      until={dates.until}
    />
  );
}
