import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { ensureOwnerPage } from '@/server/auth';

import { OwnerPage } from '../../owner-page';
import { PayoutForm } from './payout-form';
import { selectPayoutAccount } from './payout-store';

export const metadata: Metadata = { title: '정산 계좌' };

const PAGE_PATH = '/owner/settings/payout';

// 매장 설정 > 정산 계좌 (O7 ②, S-107). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC 기준
export default function PayoutPage() {
  return (
    <OwnerPage
      title="정산 계좌"
      width="narrow"
      backHref="/owner/settings"
      description="정산금을 받는 계좌예요. 고객에게는 보이지 않아요."
    >
      <Suspense fallback={<LoadingCards count={1} />}>
        <PayoutContent />
      </Suspense>
    </OwnerPage>
  );
}

async function PayoutContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  // 가입 때 넣지만, 계좌 없이 만든 원장님(시드 등)은 null이고 등록 칸을 보여준다(#213)
  const account = await selectPayoutAccount(getDb(), auth.shopId);
  // 저장된 계좌가 바뀌면 폼이 입력 중이던 칸을 닫는다(payout-form.tsx)
  return <PayoutForm shopId={auth.shopId} account={account} />;
}
