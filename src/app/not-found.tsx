import type { Metadata } from 'next';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { EmptyState } from '@/components/ui/state';
import { CUSTOMER_HOME } from '@/server/auth/paths';

export const metadata: Metadata = { title: '페이지를 찾을 수 없어요' };

// 없는 주소와 notFound()(예: 운영자가 아닌데 운영자 화면)에서 보여주는 화면. 고객·원장님 어느 쪽에서 와도 돌아갈 수 있게 둘 다 둔다.
// 로고는 첫 화면(/, 계정 고르기), "홈으로"는 고객 홈이다(#215)
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4">
      <Link href="/" aria-label="홈으로">
        <Logo className="h-7" />
      </Link>
      <EmptyState
        className="rounded-xl bg-card py-10"
        title="페이지를 찾을 수 없어요"
        description="주소가 바뀌었거나 아직 준비 중인 화면이에요."
        action={
          <div className="flex gap-2">
            <Link href={CUSTOMER_HOME} className={buttonVariants()}>
              홈으로
            </Link>
            <Link href="/owner" className={buttonVariants({ variant: 'outline' })}>
              원장님 화면으로
            </Link>
          </div>
        }
      />
    </main>
  );
}
