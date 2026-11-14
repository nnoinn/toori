import { Suspense } from 'react';
import type { Metadata } from 'next';

import { Skeleton } from '@/components/ui/skeleton';
import { FilterSheet } from '@/features/map/filter-sheet';
import { parseFilters } from '@/features/map/filters';
import { getCustomerLocation } from '@/features/map/location';
import { HomeExplorer } from '@/features/map/home-explorer';
import { LocationIntro } from '@/features/map/location-intro';
import { LocationSwitcher } from '@/features/map/location-switcher';
import { REGION_PARAM, withLinkedRegion } from '@/features/map/region-link';
import { parseSort } from '@/features/map/slot-list/sort';
import { getRequestNow } from '@/lib/request-time';

// 지도 = 지도 + 목록 탐색 화면(J3·J4). 주소: /home/map(고객 홈 /home에서 골라 들어온다, #215). 매물은 지도 영역이 정해지면 화면이 서버 함수(slot-list/actions.ts)로 불러온다.
// 위치·동네가 없으면 먼저 위치 안내·동네 선택(C-102, J2)을 보여준다. 필터는 주소창 값(J5)이다.
// 동네 링크 /home/map?region=41273 으로 들어오면 그 동네 가운데에서 지도를 연다(region-link.ts, 목록과 같은 규칙).
const TITLE = '지도';
export const metadata: Metadata = { title: TITLE };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function MapPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<MapSkeleton />}>
      <MapContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MapContent({ searchParams }: { searchParams: SearchParams }) {
  const [saved, params, now] = await Promise.all([
    getCustomerLocation(),
    searchParams,
    getRequestNow(),
  ]);
  // 동네 링크(?region=)로 들어왔으면 고른 동네·내 위치 대신 그 동네를 보여준다. 고른 동네(쿠키)는 그대로 둔다
  const location = withLinkedRegion(saved, params[REGION_PARAM]);
  if (!location) return <LocationIntro />;

  const isRegion = location.kind === 'region';

  return (
    <HomeExplorer
      center={location.point}
      myLocation={isRegion ? null : location.point}
      sort={parseSort(params.sort)}
      serverNow={now.toISOString()}
      header={
        <div className="flex items-center">
          {/* 화면 제목(화면 읽기 프로그램용). 눈에는 동네 이름이 제목 자리에 보인다 */}
          <h1 className="sr-only">{TITLE}</h1>
          <LocationSwitcher
            label={isRegion ? location.region.name : '내 위치'}
            selectedCode={isRegion ? location.region.code : null}
          />
          <FilterSheet filters={parseFilters(params)} />
        </div>
      }
    />
  );
}

function MapSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
