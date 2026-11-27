import { cache, Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { isUuid } from '@/lib/uuid';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { getCurrentAccount } from '@/server/auth';
import { getOptionalConsents } from '@/server/auth/customer-account';

import { isFavoriteShop } from '../../home/favorites/store';
import { selectPublicShopProfile, selectShopSlots } from './queries';
import { ShopProfileView } from './shop-profile-view';
import { shopProfilePath } from './shop-format';

type Params = Promise<{ shopId: string }>;

// 샵 프로필 (C-309). 주소: /shops/[shopId]. 로그인하지 않아도 볼 수 있다(매물 상세와 같다).
// 승인되지 않은 샵(승인 대기·반려·탈퇴)과 없는 샵은 주소로 바로 들어와도 404다(queries.ts).
export default function ShopProfilePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <ProfileContent params={params} />
    </Suspense>
  );
}

/** 고객 모드로 로그인한 고객 계정만. 원장님 모드로 둘러보면 null(매물 상세와 같다) */
async function currentCustomerId(): Promise<string | null> {
  const account = await getCurrentAccount();
  return account?.mode === 'customer' ? account.customerId : null;
}

/** 프로필 조회. 화면과 탭 제목(generateMetadata)이 같이 써서 한 요청에 한 번만 조회한다. 볼 수 없으면 null */
const loadProfile = cache(async (shopId: string) => {
  // 샵 ID 모양이 아니면 DB에 묻지 않고 없는 샵으로 본다
  if (!isUuid(shopId)) return null;
  return selectPublicShopProfile(getDb(), { shopId });
});

/** 탭 제목: "샘플 헤어 중앙역점 | 투리" */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const profile = await loadProfile((await params).shopId);
  return { title: profile ? profile.shop.name : '샵을 찾을 수 없어요' };
}

async function ProfileContent({ params }: { params: Params }) {
  const profile = await loadProfile((await params).shopId);
  if (!profile) notFound();
  const [customerId, now] = await Promise.all([currentCustomerId(), getRequestNow()]);
  const db = getDb();
  const [[favorite, consents], items] = await Promise.all([
    customerId
      ? Promise.all([isFavoriteShop(db, customerId, profile.shop.shopId), getOptionalConsents()])
      : Promise.resolve([false, null] as const),
    selectShopSlots(db, { profile, customerId, now }),
  ]);
  return (
    <ShopProfileView
      profile={profile}
      serverNow={now.toISOString()}
      items={items}
      favorite={favorite}
      interestAlertAgreed={consents?.ok ? consents.data.interest_alert.agreed : false}
      returnPath={shopProfilePath(profile.shop.shopId)}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-3 md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
      <Skeleton className="aspect-[4/3] w-full rounded-none md:h-[360px] md:rounded-2xl" />
      <Card className="mx-4 gap-3 px-4 md:mx-0">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
}
