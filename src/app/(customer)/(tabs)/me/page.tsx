import { Suspense } from 'react';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';

import { Skeleton } from '@/components/ui/skeleton';
import { getDb } from '@/db';
import { customers } from '@/db/schema';
import { ensureCustomerPage, getCurrentAccount } from '@/server/auth';
import { getMarketingConsent } from '@/server/auth/customer-account';
import { getInterestAreas } from '@/server/notifications/interest-areas';

import { AccountActions } from './account-actions';
import { NotificationSettings } from './notification-settings';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: '내 정보' };

// 내 정보 (J9, C-103)와 알림 설정(관심 동네·광고성 알림, J14 C-601). 주소: /me
// 로그인하지 않았으면 로그인 화면으로, 고객 계정이 없으면 약관 동의(/join)로 보낸다(ensureCustomerPage).
export default function MyInfoPage() {
  return (
    <Suspense fallback={<MyInfoSkeleton />}>
      <MyInfoContent />
    </Suspense>
  );
}

async function MyInfoContent() {
  const { customerId } = await ensureCustomerPage('/me');
  const [account, [customer], consent, interest] = await Promise.all([
    getCurrentAccount(),
    getDb()
      .select({ nickname: customers.nickname, phone: customers.phone })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1),
    getMarketingConsent(),
    getInterestAreas(),
  ]);

  return (
    <section className="flex flex-1 flex-col gap-8 px-4 py-6 md:mx-auto md:w-full md:max-w-xl md:py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">내 정보</h1>
        {account?.email ? <p className="text-sm text-muted-foreground">{account.email}</p> : null}
      </div>

      <ProfileForm nickname={customer?.nickname ?? ''} phone={customer?.phone ?? ''} />

      <NotificationSettings
        marketingAgreed={consent.ok ? consent.data.agreed : false}
        interestCodes={interest.ok ? interest.data.sigunguCodes : null}
      />

      <AccountActions hasOwnerAccount={Boolean(account?.ownerId)} />
    </section>
  );
}

function MyInfoSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:mx-auto md:w-full md:max-w-xl md:py-10">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}
