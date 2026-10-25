import { Suspense } from 'react';
import { notFound } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { getRequestNow } from '@/lib/request-time';

import { SlotDetailView } from './slot-detail-view';
import type { SlotDetail } from './types';

type Params = Promise<{ slotId: string }>;

// 매물 상세 (J7). 주소: /slots/[slotId]
export default function SlotDetailPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <DetailContent params={params} />
    </Suspense>
  );
}

/**
 * TODO(J7 조회): 매물 상태(#68 getSlotStatus·isSlotOnHold), 승인 샵(#50), 신규 고객 판별(#49)이
 * 들어오면 이 화면 폴더 안에서 DB를 조회해 SlotDetail을 만든다. 신규 고객 전용·미승인 샵 매물은
 * 주소로 바로 들어와도 여기서 막는다(없는 매물처럼 404). 지금은 조회가 없어서 항상 404다.
 */
async function getSlotDetail(slotId: string): Promise<SlotDetail | null> {
  void slotId;
  return null;
}

async function DetailContent({ params }: { params: Params }) {
  const { slotId } = await params;
  const [slot, now] = await Promise.all([getSlotDetail(slotId), getRequestNow()]);
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
