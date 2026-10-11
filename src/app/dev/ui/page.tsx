import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Countdown } from '@/components/ui/countdown';
import { Price } from '@/components/ui/price';
import { SlotBadge } from '@/components/ui/slot-badge';
import { SlotCard } from '@/components/ui/slot-card';
import { EmptyState, ErrorState, LoadingCards } from '@/components/ui/state';
import { getRequestNow } from '@/lib/request-time';

export const metadata: Metadata = { title: '공통 UI 미리보기' };

// 공통 UI 미리보기(개발용). 로컬과 Vercel 미리보기에서만 열리고 운영 배포에서는 404다.
// 가짜 데이터로 그린다. 실제 화면에서는 서버가 계산한 값을 넘긴다.
export default function UiPreviewPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-8 p-4">
      <h1 className="text-xl font-bold">공통 UI 미리보기</h1>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">매물 카드 SlotCard</h2>
        <Suspense fallback={<LoadingCards count={3} />}>
          <SampleCards />
        </Suspense>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">배지 SlotBadge</h2>
        <div className="flex flex-wrap gap-1">
          <SlotBadge kind="nonRefundable" />
          <SlotBadge kind="imminent" />
          <SlotBadge kind="newCustomerOnly" />
          <SlotBadge kind="onHold" />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">가격 Price</h2>
        <Price listPrice={50000} salePrice={35000} discountRate={30} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">10분 홀딩 타이머 Countdown(clock)</h2>
        <Suspense fallback={<span>…</span>}>
          <SampleHoldTimer />
        </Suspense>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">로딩·빈 화면·오류</h2>
        <LoadingCards count={1} />
        <EmptyState
          title="주변에 매물이 없어요"
          description="관심 동네를 등록하면 새 매물이 올라올 때 알려 드려요"
          action={<Button variant="outline">관심 동네 등록하기</Button>}
        />
        <ErrorState description="잠시 후 다시 시도해 주세요" action={<Button>다시 시도</Button>} />
      </section>
    </main>
  );
}

async function SampleCards() {
  const now = await getRequestNow();
  const serverNow = now.toISOString();
  const inHours = (h: number) => new Date(now.getTime() + h * 60 * 60 * 1000).toISOString();

  return (
    <div className="flex flex-col gap-3">
      <SlotCard
        href="/dev/ui"
        shopName="상록헤어"
        menuName="여성 커트"
        startAt={inHours(3)}
        serverNow={serverNow}
        listPrice={25000}
        salePrice={17500}
        discountRate={30}
        distanceText="350m"
        badges={['nonRefundable', 'imminent']}
      />
      <SlotCard
        shopName="네일 사동점"
        menuName="젤네일 원컬러"
        startAt={inHours(20)}
        serverNow={serverNow}
        listPrice={50000}
        salePrice={35000}
        discountRate={30}
        distanceText="1.2km"
        badges={['newCustomerOnly']}
      />
      <SlotCard
        shopName="고잔 속눈썹"
        menuName="속눈썹 연장 (자연스러운 컬)"
        startAt={inHours(30)}
        serverNow={serverNow}
        listPrice={60000}
        salePrice={36000}
        discountRate={40}
        badges={['onHold']}
      />
    </div>
  );
}

async function SampleHoldTimer() {
  const now = await getRequestNow();
  return (
    <Countdown
      variant="clock"
      targetAt={new Date(now.getTime() + 10 * 60 * 1000).toISOString()}
      serverNow={now.toISOString()}
      className="text-2xl font-bold"
    />
  );
}
