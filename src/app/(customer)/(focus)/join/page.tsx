import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { safeNextPath } from '@/lib/safe-next';
import { getCurrentAccount } from '@/server/auth';
import { loginPath } from '@/server/auth/paths';

import { JoinForm } from './join-form';

export const metadata: Metadata = { title: '약관 동의' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// 첫 로그인 고객의 약관 동의 화면 (C-104, J8, D16). 로그인 콜백이 /join?next=... 로 보낸다(#47 3장).
// 로그인하지 않았으면 고객 토글로 로그인 화면에, 이미 고객 계정이 있으면 next로 바로 보낸다.
// 원장님 계정만 있는 사람은 그대로 보여준다(가입하면 고객 모드로 바뀐다, #47 4장).
export default function JoinPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<JoinSkeleton />}>
      <JoinContent searchParams={searchParams} />
    </Suspense>
  );
}

async function JoinContent({ searchParams }: { searchParams: SearchParams }) {
  const [params, account] = await Promise.all([searchParams, getCurrentAccount()]);
  const next = safeNextPath(first(params.next), '/');
  if (!account) redirect(loginPath('customer', next));
  if (account.customerId) redirect(next);
  return <JoinForm next={next} />;
}

function JoinSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-12">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
