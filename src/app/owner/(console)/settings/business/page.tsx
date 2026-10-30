import { Suspense } from 'react';
import type { Metadata } from 'next';

import { BackButton } from '@/components/ui/back-button';
import { ErrorState, LoadingCards } from '@/components/ui/state';
import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { ensureOwnerPage } from '@/server/auth';

import { kstDateKey } from '../../../business-fields';
import { BusinessInfoForm } from './business-info-form';
import { selectBusinessInfo } from './business-info-store';

export const metadata: Metadata = { title: '사업자 정보' };

const PAGE_PATH = '/owner/settings/business';

// 매장 설정 > 사업자 정보 (O7 ②, S-101·S-102, #23 D19). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC 기준
export default function BusinessInfoPage() {
  return (
    <main className="flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-2">
        <BackButton fallbackHref="/owner/settings" />
        <h1 className="text-xl font-bold">사업자 정보</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        입점 심사와 정산에 쓰는 정보예요. 고객에게는 보이지 않아요.
      </p>
      <Suspense fallback={<LoadingCards count={2} />}>
        <BusinessInfoContent />
      </Suspense>
    </main>
  );
}

async function BusinessInfoContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const [info, now] = await Promise.all([
    selectBusinessInfo(getDb(), auth.shopId),
    getRequestNow(),
  ]);
  if (!info) return <ErrorState description="샵을 찾을 수 없어요" />;
  return (
    <BusinessInfoForm
      // 저장된 값이 바뀌면 폼이 입력 칸을 그 값으로 맞춘다(business-info-form.tsx)
      shopId={auth.shopId}
      today={kstDateKey(now)}
      initial={info}
    />
  );
}
