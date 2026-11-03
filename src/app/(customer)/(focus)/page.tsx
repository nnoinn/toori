import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { getCurrentAccount } from '@/server/auth';

import { LoginForm } from './login/login-form';

// 첫 화면 = 로그인(계정 고르기) (#215, 11/2 nnoinn). 주소: /
// 로그인 안 했으면 로그인(고객/원장님 토글 + 카카오·구글)과 "로그인 없이 둘러보기"(고객 홈 /home).
// 이미 로그인했으면 [고객으로 계속하기]·[원장님으로 계속하기]. 그 계정이 없으면 가입으로 보낸다.
// 고객 홈은 /home, 원장님 첫 화면은 /owner다. PWA 시작 주소(manifest)도 이 화면이다
export default function FirstPage() {
  return (
    <Suspense fallback={<FirstSkeleton />}>
      <FirstContent />
    </Suspense>
  );
}

async function FirstContent() {
  const account = await getCurrentAccount();
  return (
    <LoginForm
      variant="first"
      initialMode={account?.mode ?? 'customer'}
      nextParam={null}
      error={null}
      signedInEmail={account?.email ?? null}
      accounts={
        account
          ? { customer: Boolean(account.customerId), owner: Boolean(account.ownerId) }
          : undefined
      }
    />
  );
}

function FirstSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-12">
      <Skeleton className="mx-auto h-9 w-32" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
