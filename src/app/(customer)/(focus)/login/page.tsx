import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Skeleton } from '@/components/ui/skeleton';

import { LoginForm } from './login-form';
import { parseLoginError, parseLoginMode, readNextParam } from './login-params';

export const metadata: Metadata = { title: '로그인' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 로그인 화면 (J8, C-101). 주소: /login?mode=customer|owner&next=/... (#47 8장)
// 주소 값(searchParams)은 요청 때만 알 수 있어서 <Suspense> 안에서 읽는다(Cache Components).
export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  return (
    <LoginForm
      initialMode={parseLoginMode(params.mode)}
      nextParam={readNextParam(params.next)}
      error={parseLoginError(params.error)}
    />
  );
}

function LoginSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-12">
      <Skeleton className="mx-auto h-8 w-40" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
