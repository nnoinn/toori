import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { getCustomerLocation } from '@/features/map/location';
import { HomeExplorer } from '@/features/map/home-explorer';
import { LocationIntro } from '@/features/map/location-intro';
import { LocationSwitcher } from '@/features/map/location-switcher';

// 홈 = 지도 + 목록 시트 탐색 화면(J3). 매물 목록은 J4에서 붙인다.
// 위치·동네가 없으면 먼저 위치 안내·동네 선택(C-102, J2)을 보여준다.
export default function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const location = await getCustomerLocation();
  if (!location) return <LocationIntro />;

  const isRegion = location.kind === 'region';

  return (
    <HomeExplorer
      center={location.point}
      myLocation={isRegion ? null : location.point}
      header={
        <LocationSwitcher
          label={isRegion ? location.region.name : '내 위치'}
          selectedCode={isRegion ? location.region.code : null}
        />
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
