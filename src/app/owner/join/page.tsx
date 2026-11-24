import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { LoadingCards } from '@/components/ui/state';
import { getRequestNow } from '@/lib/request-time';
import { getCurrentAccount } from '@/server/auth';
import { kstDateKey } from '@/lib/time';

import { readOwnerRestorable } from '../restore/read-restorable';
import { ownerEntryRedirect } from '../restore/restore-rules';
import { OwnerJoinForm } from './owner-join-form';

export const metadata: Metadata = { title: '원장님 가입' };

// 원장님 가입·입점 신청 (O7 ①, S-101 화면·S-107·S-108, #23 D1·D2·D3·D17). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장)
export default function OwnerJoinPage() {
  return (
    <Suspense fallback={<LoadingCards count={3} />}>
      <OwnerJoinContent />
    </Suspense>
  );
}

async function OwnerJoinContent() {
  // proxy가 먼저 막지만(원장님 모드로 로그인해야 들어옴) 한 번 더 확인한다. 이미 가입했으면 원장님 화면으로,
  // 30일 안에 탈퇴한 원장님 계정이 있으면 새 가입 대신 되살리기 화면으로(#154 3장)
  const account = await getCurrentAccount();
  const to = ownerEntryRedirect('join', account, await readOwnerRestorable(account));
  if (to) redirect(to);

  return <OwnerJoinForm today={kstDateKey(await getRequestNow())} />;
}
