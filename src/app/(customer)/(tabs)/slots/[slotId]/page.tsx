import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { z } from 'zod';

import { getDb } from '@/db';
import { getRequestNow } from '@/lib/request-time';
import { getCurrentAccount } from '@/server/auth';

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

async function DetailContent({ params }: { params: Params }) {
  const { slotId } = await params;
  // 매물 ID 모양이 아니면 DB에 묻지 않고 없는 매물로 본다
  if (!z.uuid().safeParse(slotId).success) notFound();
  const [customerId, now] = await Promise.all([currentCustomerId(), getRequestNow()]);
  const slot = await selectSlotDetail(getDb(), { slotId, customerId, now });
  if (!slot) notFound();
  return <SlotDetailView slot={slot} serverNow={now.toISOString()} />;
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
