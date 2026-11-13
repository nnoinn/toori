import { cache, Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { getCurrentAccount } from '@/server/auth';
import { getOptionalConsents } from '@/server/auth/customer-account';
import { getSlotWindow } from '@/server/slot-windows';

import { isFavoriteShop } from '../../home/favorites/store';
import { WindowDetailView } from './window-detail-view';

type Params = Promise<{ windowId: string }>;

// 시간대 상세 (#308, S-201 두 번째 방식의 고객 화면). 주소: /windows/[windowId]
// 볼 수 없는 시간대(승인 안 된 샵, 그 샵 기존 고객에게 신규 고객 전용, 게시 전·마감, 시작할 수 있는 시각 없음)는
// getSlotWindow가 null을 주고 404다. 지금은 강규민 가짜 결과 버전(#344): 로컬에서 DEV_FAKE_SLOT_WINDOWS=on일 때만 보인다
export default function WindowDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailContent params={params} />
    </Suspense>
  );
}

/** 고객 모드로 로그인한 고객 계정만. 원장님 모드로 둘러보면 null(매물 상세와 같다) */
async function currentCustomerId(): Promise<string | null> {
  const account = await getCurrentAccount();
  return account?.mode === 'customer' ? account.customerId : null;
}

/** 상세 조회. 화면과 탭 제목(generateMetadata)이 같이 써서 한 요청에 한 번만 조회한다. 볼 수 없으면 null */
const loadWindow = cache(async (windowId: string) => {
  const [customerId, now] = await Promise.all([currentCustomerId(), getRequestNow()]);
  const window = await getSlotWindow(getDb(), { windowId, customerId, now });
  return window ? { window, customerId } : null;
});

/** 탭 제목: "할인 시간대 · 샘플 헤어 중앙역점 | 투리" */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const loaded = await loadWindow((await params).windowId);
  return {
    title: loaded ? `할인 시간대 · ${loaded.window.shop.name}` : '시간대를 찾을 수 없어요',
  };
}

async function DetailContent({ params }: { params: Params }) {
  const loaded = await loadWindow((await params).windowId);
  if (!loaded) notFound();
  const { window, customerId } = loaded;
  const [favorite, consents] = customerId
    ? await Promise.all([
        isFavoriteShop(getDb(), customerId, window.shop.shopId),
        getOptionalConsents(),
      ])
    : [false, null];
  return (
    <WindowDetailView
      window={window}
      favorite={favorite}
      interestAlertAgreed={consents?.ok ? consents.data.interest_alert.agreed : false}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <Card className="mx-4 gap-3 px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
}
