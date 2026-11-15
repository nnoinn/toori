import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Logo } from '@/components/ui/logo';
import { Skeleton } from '@/components/ui/skeleton';
import { firstParam, type SearchValue } from '@/lib/search-params';

import { AdminLoginForm } from './admin-login-form';
import { ADMIN_LOGIN_ERROR_MESSAGES, toAdminLoginError, toAdminNext } from './admin-login-texts';

export const metadata: Metadata = { title: '운영자 로그인' };

type SearchParams = Promise<{ next?: SearchValue; error?: SearchValue }>;

// 운영자 입구 (#372 1장, 11/13 nnoinn). 주소: /admin/login?next=운영자 화면&error=not_admin|login_failed|email_required
// 첫 화면과 /login에는 고객·원장님만 두고, 운영자는 여기서 따로 로그인한다. 이미 운영자로 들어와 있으면 proxy가 /admin으로 보낸다.
// 운영자 권한(profiles.is_admin)이 없으면 로그인 콜백이 바로 로그아웃시키고 여기로 돌려보낸다(not_admin)
export default function AdminLoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    // data-admin-login: 운영자 레이아웃이 이 표시를 보고 메뉴를 숨긴다(layout.tsx)
    <main data-admin-login className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl bg-card p-8 ring-1 ring-foreground/10">
        <div className="flex flex-col items-center gap-2">
          <Logo className="h-8 w-auto" />
          <h1 className="text-lg font-bold">운영자 로그인</h1>
          <p className="text-center text-sm text-muted-foreground">
            운영자 권한이 있는 계정으로 로그인해 주세요. 고객·원장님은 첫 화면에서 로그인해요.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-28 w-full" />}>
          <LoginButtons searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginButtons({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const error = toAdminLoginError(firstParam(params.error));
  return (
    <AdminLoginForm
      next={toAdminNext(firstParam(params.next))}
      error={error ? ADMIN_LOGIN_ERROR_MESSAGES[error] : null}
    />
  );
}
