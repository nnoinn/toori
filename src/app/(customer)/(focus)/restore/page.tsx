import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { safeNextPath } from '@/lib/safe-next';
import { firstParam } from '@/lib/search-params';
import { getRestorableAccount } from '@/server/accounts/withdrawal';
import { getCurrentAccount } from '@/server/auth';
import { loginPath } from '@/server/auth/paths';
import { WITHDRAWAL_RESTORE_DAYS } from '@/server/policy/withdrawal';

import { RestoreForm } from './restore-form';
import { restorePath } from './restore-rules';

export const metadata: Metadata = { title: '계정 되살리기' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 고객 계정 되살리기 (#154 3장, C-106). 주소: /restore?next=...
// 탈퇴한 지 30일 안에 같은 로그인으로 고객 계정에 들어오면 가입 화면(/join)이 이리로 보낸다(새 가입은 막힌다).
// 로그인하지 않았으면 고객 로그인으로, 이미 고객 계정이 있으면 next로, 되살릴 계정이 없으면 가입 화면으로 보낸다
export default function RestorePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<RestoreSkeleton />}>
      <RestoreContent searchParams={searchParams} />
    </Suspense>
  );
}

async function RestoreContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, account] = await Promise.all([searchParams, getCurrentAccount()]);
  const next = safeNextPath(firstParam(params.next), '/');
  if (!account) redirect(loginPath('customer', restorePath(next)));
  if (account.customerId) redirect(next);
  const restorable = await getRestorableAccount('customer');
  if (!restorable.ok || !restorable.data) redirect(`/join?next=${encodeURIComponent(next)}`);
  return (
    <RestoreForm account={restorable.data} restoreDays={WITHDRAWAL_RESTORE_DAYS} next={next} />
  );
}

function RestoreSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-12">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
