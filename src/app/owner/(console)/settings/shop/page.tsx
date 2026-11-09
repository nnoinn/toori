import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/state';
import { getDb } from '@/db';
import { ensureOwnerPage } from '@/server/auth';

import { OwnerPage } from '../../owner-page';
import { toHoursRows } from './shop-profile';
import { ShopProfileForm } from './shop-profile-form';
import { selectShopProfile } from './shop-profile-store';

export const metadata: Metadata = { title: '샵 정보' };

const PAGE_PATH = '/owner/settings/shop';

// 매장 설정 > 샵 정보 (O2, S-103). 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장). PC 기준
export default function ShopProfilePage() {
  return (
    <OwnerPage
      title="샵 정보"
      width="narrow"
      backHref="/owner/settings"
      description="고객이 매물과 함께 보는 정보예요. 입점 승인 전에도 고칠 수 있어요."
    >
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <ShopProfileContent />
      </Suspense>
    </OwnerPage>
  );
}

async function ShopProfileContent() {
  // 로그인하지 않았으면 로그인 화면, 원장님 가입 전이면 /owner/join 으로 보낸다
  const auth = await ensureOwnerPage(PAGE_PATH);
  const profile = await selectShopProfile(getDb(), auth.shopId);
  if (!profile) return <ErrorState description="샵을 찾을 수 없어요" />;

  return (
    <ShopProfileForm
      shopId={auth.shopId}
      initial={{
        name: profile.name,
        category: profile.category,
        phone: profile.phone,
        roadAddress: profile.roadAddress,
        addressDetail: profile.addressDetail ?? '',
        description: profile.description ?? '',
        hours: toHoursRows(profile.businessHours),
      }}
    />
  );
}
