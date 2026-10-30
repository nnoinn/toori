import { Suspense } from 'react';
import type { Metadata } from 'next';

import { BackButton } from '@/components/ui/back-button';
import { ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { ensureOwnerPage } from '@/server/auth';

import { PayoutForm } from './payout-form';
import { selectPayoutAccount } from './payout-store';

export const metadata: Metadata = { title: '정산 계좌' };

const PAGE_PATH = '/owner/settings/payout';

// 매장 설정 > 정산 계좌 (O7 ②, S-107). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC 기준
export default function PayoutPage() {
  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/owner/settings" />
        <h1 className="text-xl font-bold">정산 계좌</h1>
      </div>
      <Suspense fallback={<LoadingCards count={1} />}>
        <PayoutContent />
      </Suspense>
    </main>
  );
}

async function PayoutContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const account = await selectPayoutAccount(getDb(), auth.shopId);
  if (!account) return <ErrorState description="정산 계좌를 찾을 수 없어요" />;
  // 저장된 계좌가 바뀌면 폼을 새로 시작한다(기술 가이드 2장 "떠났다 돌아온 화면")
  return <PayoutForm key={JSON.stringify(account)} shopId={auth.shopId} account={account} />;
}
