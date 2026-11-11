import { cache, Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { isUuid } from '@/lib/uuid';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { getCurrentAccount } from '@/server/auth';
import { getOptionalConsents } from '@/server/auth/customer-account';

import { isFavoriteShop } from '../../home/favorites/store';
import { selectSlotDetail } from './queries';
import { SlotDetailView } from './slot-detail-view';

type Params = Promise<{ slotId: string }>;

// 매물 상세 (J7). 주소: /slots/[slotId]
// 승인되지 않은 샵, 이력 있는 고객의 신규 고객 전용, 게시 전 매물은 주소로 바로 들어와도 404다(queries.ts).
export default function SlotDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailContent params={params} />
    </Suspense>
  );
}

/** 고객 모드로 로그인한 고객 계정만. 원장님 모드로 둘러보면 null(#49 3장) */
async function currentCustomerId(): Promise<string | null> {
  const account = await getCurrentAccount();
  return account?.mode === 'customer' ? account.customerId : null;
}

/** 상세 조회. 화면과 탭 제목(generateMetadata)이 같이 써서 한 요청에 한 번만 조회한다. 볼 수 없으면 null */
const loadSlot = cache(async (slotId: string) => {
  // 매물 ID 모양이 아니면 DB에 묻지 않고 없는 매물로 본다
  if (!isUuid(slotId)) return null;
  const [customerId, now] = await Promise.all([currentCustomerId(), getRequestNow()]);
  const slot = await selectSlotDetail(getDb(), { slotId, customerId, now });
  return slot ? { slot, customerId, now } : null;
});

/** 탭 제목: "여성 커트 · 샘플 헤어 중앙역점 | 투리" */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const loaded = await loadSlot((await params).slotId);
  return {
    title: loaded ? `${loaded.slot.menu.name} · ${loaded.slot.shop.name}` : '매물을 찾을 수 없어요',
  };
}

async function DetailContent({ params }: { params: Params }) {
  const loaded = await loadSlot((await params).slotId);
  if (!loaded) notFound();
  const { slot, customerId, now } = loaded;
  const [favorite, consents] = customerId
    ? await Promise.all([
        isFavoriteShop(getDb(), customerId, slot.shop.shopId),
        getOptionalConsents(),
      ])
    : [false, null];
  return (
    <SlotDetailView
      slot={slot}
      serverNow={now.toISOString()}
      favorite={favorite}
      interestAlertAgreed={consents?.ok ? consents.data.interest_alert.agreed : false}
    />
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="flex flex-col gap-3 px-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
