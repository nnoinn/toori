import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Skeleton } from '@/components/ui/skeleton';

import { resolveNextPath } from '../login/login-params';
import { JoinForm } from './join-form';

export const metadata: Metadata = { title: '약관 동의' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 첫 로그인 고객의 약관 동의 화면 (C-104, J8, D16). 로그인 콜백이 /join?next=... 로 보낸다(#47 3장).
// TODO(#47 2장): ensure…/getCurrentAccount가 들어오면 로그인하지 않았거나 이미 고객 계정이 있는 사람은 돌려보낸다
export default function JoinPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<JoinSkeleton />}>
      <JoinContent searchParams={searchParams} />
    </Suspense>
  );
}

async function JoinContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return <JoinForm next={resolveNextPath(params.next, 'customer')} />;
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
