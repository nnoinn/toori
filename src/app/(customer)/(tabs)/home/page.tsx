import { Suspense } from 'react';
import type { Metadata } from 'next';

import { AccountNotificationBell } from '@/components/ui/account-notification-bell';
import { Logo } from '@/components/ui/logo';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, LoadingList } from '@/components/ui/state';
import { getDb } from '@/db';
import { EMPTY_FILTERS } from '@/features/map/filters';
import { resolveListArea } from '@/features/map/list-area';
import { getCustomerLocation } from '@/features/map/location';
import { LocationIntro } from '@/features/map/location-intro';
import {
  countListItems,
  selectFavoriteSlots,
  selectSlotPage,
} from '@/features/map/slot-list/queries';
import type { SlotSort } from '@/features/map/slot-list/sort';
import { getRequestNow } from '@/lib/request-time';
import { getCurrentAccount } from '@/server/auth';
import { getOptionalConsents } from '@/server/auth/customer-account';
import { getInterestAreas } from '@/server/notifications/interest-areas';

import { countFavoriteShops } from './favorites/store';
import { AreaAlert, type AreaAlertState } from './list/area-alert';
import {
  LobbyAreaBar,
  LobbyCard,
  LobbyFavoritesBox,
  LobbyMapBox,
  LobbySection,
  LobbyTiles,
} from './lobby-parts';
import { favoriteSummaryText, LOBBY_ROW_COUNT, sortedListHref, withoutShown } from './lobby-rules';
import { SearchBox } from './search-box';
import {
  CUSTOMER_NOTIFICATION_ACCOUNT,
  NOTIFICATIONS_PATH,
} from '../notifications/notification-rules';

export const metadata: Metadata = { title: '홈' };

// 고객 홈 = 로비 (#215 2장, 11/15 회의 6번·1번, 11/20 정찬형 A안). 주소: /home. 당근 웹처럼:
// 동네 줄(PC는 가운데 검색 칸, 폰은 줄 아래 검색 칸, C-210) → 바로가기 8칸 → 왼쪽 매물 칸(곧 시작하는 매물 5개·많이 할인하는 매물 3개), 오른쪽(PC) 지도·관심 동네·찜한 샵 상자.
// 폰은 위쪽 줄에 로고와 알림 종(종은 이 화면에만, #371), 관심 동네 상자는 바로가기 아래(회의 1번), 매물 칸은 3줄씩.
// 범위는 매물 목록과 같다(고른 동네, 내 위치면 그 시·군·구). 동네를 아직 안 골랐으면 위치 안내·동네 고르기를 보여준다.
// 로그인하지 않아도 볼 수 있다(#215 댓글). 찜한 샵 매물만 들어갈 때 로그인 화면을 거친다
export default function CustomerHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-4 px-4 py-3 md:mx-auto md:w-full md:max-w-5xl md:gap-5 md:px-6 md:py-8">
      {/* 폰의 알림 종은 이 화면 위 오른쪽에만 둔다(#371, 11/15 nnoinn). PC는 위쪽 메뉴의 로고·종을 쓴다 */}
      <div className="flex items-center justify-between md:hidden">
        <Logo />
        <AccountNotificationBell
          account={CUSTOMER_NOTIFICATION_ACCOUNT}
          href={NOTIFICATIONS_PATH}
          className="-mr-2"
        />
      </div>
      <Suspense fallback={<LobbyFallback />}>
        <LobbyContent />
      </Suspense>
    </main>
  );
}

/** 고객 모드로 로그인한 고객 계정만. 원장님 모드로 둘러보면 null(#49 3장) */
async function currentCustomerId(): Promise<string | null> {
  const account = await getCurrentAccount();
  return account?.mode === 'customer' ? account.customerId : null;
}

async function LobbyContent() {
  const [location, now, customerId] = await Promise.all([
    getCustomerLocation(),
    getRequestNow(),
    currentCustomerId(),
  ]);
  // 처음 들어온 고객: 바로가기 아래에 위치 안내·동네 고르기(매물 목록과 같은 화면)
  if (!location) {
    return (
      <>
        <LobbyTiles />
        <LobbyCard>
          <LocationIntro />
        </LobbyCard>
      </>
    );
  }

  const isRegion = location.kind === 'region';
  const area = await resolveListArea(location);
  if (!area) {
    return (
      <>
        <h1 className="sr-only">홈</h1>
        <LobbyAreaBar label="내 위치" selectedCode={null} total={null} />
        <LobbyTiles />
        <p role="alert" className="rounded-2xl border bg-card p-4 text-sm">
          내 위치가 속한 동네를 찾지 못했어요. 위쪽 &apos;내 위치&apos;를 눌러 동네를 골라 주세요.
        </p>
      </>
    );
  }

  const db = getDb();
  const visible = { sigunguCode: area.sigunguCode, filters: EMPTY_FILTERS, customerId, now };
  // 매물 목록 첫 쪽(20개)을 그 정렬로 읽어 앞에서부터 쓴다. 목록과 같은 조건(게시중·신규 고객 전용·시간대)이다
  const firstPage = (sort: SlotSort) =>
    selectSlotPage(db, { ...visible, origin: area.origin, sort, cursor: null, shopId: null });
  // 관심 동네·동의·찜은 고객으로 로그인했을 때만 읽힌다(아니면 실패 → 알림 권유는 로그인부터)
  const [total, imminent, discount, interest, consents, favorites] = await Promise.all([
    countListItems(db, visible),
    firstPage('imminent'),
    firstPage('discount'),
    getInterestAreas(),
    getOptionalConsents(),
    customerId
      ? Promise.all([
          countFavoriteShops(db, customerId),
          selectFavoriteSlots(db, { customerId, now, origin: area.origin }),
        ])
      : null,
  ]);
  const alertState: AreaAlertState | null =
    interest.ok && consents.ok
      ? {
          watching: interest.data.sigunguCodes.includes(area.sigunguCode),
          interestAlertAgreed: consents.data.interest_alert.agreed,
        }
      : null;
  const serverNow = now.toISOString();
  const imminentItems = imminent.items.slice(0, LOBBY_ROW_COUNT.imminent);
  // 위 칸에 나온 매물은 빼고(겹치지 않게). 남는 매물이 없으면(매물이 적은 동네) 아래 칸은 그리지 않는다
  const discountItems = withoutShown(discount.items, imminentItems, LOBBY_ROW_COUNT.discount);
  const areaAlert = (
    <AreaAlert
      variant="side"
      areaCode={area.sigunguCode}
      areaLabel={area.label}
      state={alertState}
    />
  );

  return (
    <>
      <h1 className="sr-only">홈</h1>
      <LobbyAreaBar
        label={isRegion ? area.label : '내 위치'}
        selectedCode={isRegion ? location.region.code : null}
        total={total}
        search={<SearchBox filled />}
      />
      {/* 폰은 동네 줄이 좁아서 검색 칸을 그 아래 한 줄에 둔다(폰 단계에서 다듬는다) */}
      <SearchBox className="md:hidden" />
      <LobbyTiles />
      <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_300px] md:items-start md:gap-6">
        <div className="flex flex-col gap-4">
          {/* 폰의 관심 동네 상자는 바로가기 바로 아래(11/15 회의 1번). PC는 오른쪽 칸 */}
          <div className="md:hidden">{areaAlert}</div>
          {total === 0 ? (
            <LobbyCard>
              <EmptyState
                title={`${area.label}에 지금 올라온 매물이 없어요`}
                description="새 매물이 올라오면 여기에 보여요. 관심 동네로 등록하면 알려 드려요."
              />
            </LobbyCard>
          ) : (
            <>
              <LobbySection
                id="lobby-imminent"
                title="곧 시작하는 매물"
                note="시작이 가까운 순"
                moreHref={sortedListHref('imminent')}
                items={imminentItems}
                serverNow={serverNow}
              />
              {discountItems.length > 0 ? (
                <LobbySection
                  id="lobby-discount"
                  title="많이 할인하는 매물"
                  note="할인율이 큰 순"
                  moreHref={sortedListHref('discount')}
                  items={discountItems}
                  serverNow={serverNow}
                />
              ) : null}
            </>
          )}
        </div>
        <aside
          aria-label="지도·관심 동네·찜한 샵"
          className="hidden md:sticky md:top-20 md:flex md:flex-col md:gap-3"
        >
          <LobbyMapBox />
          {areaAlert}
          <LobbyFavoritesBox
            summary={favorites ? favoriteSummaryText(favorites[0], favorites[1]) : null}
          />
        </aside>
      </div>
    </>
  );
}

/** 불러오는 동안: 동네 줄 자리, 바로가기(바로 보인다), 매물 칸 회색 틀 */
function LobbyFallback() {
  return (
    <>
      <Skeleton className="h-12 w-full rounded-2xl md:rounded-full" />
      <LobbyTiles />
      <div className="md:grid md:grid-cols-[minmax(0,1fr)_300px] md:gap-6">
        <LoadingList count={3} className="overflow-hidden rounded-2xl border bg-card" />
      </div>
    </>
  );
}
