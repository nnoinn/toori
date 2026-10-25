import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { FilterSheet } from '@/features/map/filter-sheet';
import { parseFilters } from '@/features/map/filters';
import { getCustomerLocation } from '@/features/map/location';
import { HomeExplorer } from '@/features/map/home-explorer';
import { LocationIntro } from '@/features/map/location-intro';
import { LocationSwitcher } from '@/features/map/location-switcher';

// 홈 = 지도 + 목록 시트 탐색 화면(J3). 매물 목록은 J4에서 붙인다.
// 위치·동네가 없으면 먼저 위치 안내·동네 선택(C-102, J2)을 보여준다. 필터는 주소창 값(J5)이다.
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function HomePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({ searchParams }: { searchParams: SearchParams }) {
  const [location, params] = await Promise.all([getCustomerLocation(), searchParams]);
  if (!location) return <LocationIntro />;

  const isRegion = location.kind === 'region';

  return (
    <HomeExplorer
      center={location.point}
      myLocation={isRegion ? null : location.point}
      header={
        <div className="flex items-center">
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

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
