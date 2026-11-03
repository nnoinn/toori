import { Suspense } from 'react';
import type { Metadata } from 'next';

import { LoadingCards } from '@/components/ui/state';
import { FilterSheet } from '@/features/map/filter-sheet';
import { parseFilters } from '@/features/map/filters';
import { resolveListArea } from '@/features/map/list-area';
import { getCustomerLocation } from '@/features/map/location';
import { LocationIntro } from '@/features/map/location-intro';
import { LocationSwitcher } from '@/features/map/location-switcher';
import { parseSort } from '@/features/map/slot-list/sort';
import { getRequestNow } from '@/lib/request-time';

import { RegionListView } from './region-list-view';

export const metadata: Metadata = { title: '매물 목록' };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// 매물 목록(지도 없이) (#215 2장). 주소: /home/list. 고객 홈(/home)에서 골라 들어온다.
// 범위는 고른 동네(시·군·구), 내 위치면 내 위치가 속한 시·군·구다(11/3 결정). 찾지 못하면 위쪽에서 동네를 고르게 한다.
// 위치·동네가 없으면 지도처럼 먼저 위치 안내·동네 선택(C-102)을 보여준다. 필터·정렬은 주소창 값(J5)이다
export default function ListPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 flex-col gap-3 py-3 md:mx-auto md:w-full md:max-w-3xl md:px-6 md:py-6">
      <Suspense fallback={<LoadingCards count={3} className="px-4 md:px-0" />}>
        <ListContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function ListContent({ searchParams }: { searchParams: SearchParams }) {
  const [location, params, now] = await Promise.all([
    getCustomerLocation(),
    searchParams,
    getRequestNow(),
  ]);
  if (!location) return <LocationIntro />;

  const area = await resolveListArea(location);
  const isRegion = location.kind === 'region';

  return (
    <>
      <div className="flex items-center px-2 md:px-0">
        <LocationSwitcher
          label={isRegion ? location.region.name : '내 위치'}
          selectedCode={isRegion ? location.region.code : null}
        />
        <FilterSheet filters={parseFilters(params)} />
      </div>
      {area ? (
        <RegionListView
          // 동네가 바뀌면 새로 시작한다(떠났다 와도 남는 화면, Activity)
          key={area.sigunguCode}
          areaCode={area.sigunguCode}
          areaLabel={area.fromMyLocation ? `내 위치 · ${area.label}` : area.label}
          sort={parseSort(params.sort)}
          serverNow={now.toISOString()}
        />
      ) : (
        <p role="alert" className="mx-4 rounded-xl border bg-card p-4 text-sm md:mx-0">
          내 위치가 속한 동네를 찾지 못했어요. 위쪽 &apos;내 위치&apos;를 눌러 동네를 골라 주세요.
        </p>
      )}
    </>
  );
}
