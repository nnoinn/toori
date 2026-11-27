import { Suspense } from 'react';

import { AccountNotificationBell } from '@/components/ui/account-notification-bell';
import { CustomerBottomNav, CustomerTopNav } from '@/components/ui/customer-nav';

import { HoldChip, HoldPill, HoldProvider } from './hold-bar';
import { RecentButton } from './recent/recent-button';
import {
  CUSTOMER_NOTIFICATION_ACCOUNT,
  NOTIFICATIONS_PATH,
} from './notifications/notification-rules';

// 메뉴(홈/내 예약/내 정보)가 붙는 고객 화면: 홈, 매물 상세, 내 예약, 내 정보 (#71).
// 폰은 아래 메뉴(높이만큼 아래를 비운다), PC(md 이상)는 위쪽 메뉴. 화면 안쪽 폭은 각 화면이 정한다(기술 가이드 "PC 화면")
// 결제 중인 매물이 있으면 PC는 위쪽 메뉴의 알림 종 옆 초록 칩(HoldChip), 폰은 화면 위 가운데 초록 알약(HoldPill)이 뜬다
// (#359 1번, 11/23 nnoinn 시안 A). 폰은 알약이 있는 동안 위를 3.5rem 비우고 --hold-top에 그 높이를 넣는다.
// 화면 높이를 직접 정하는 홈과 폰에서 위에 붙는 칸(매물 상세 탭)도 이 값을 쓴다
// 알림 종(#371): PC는 위쪽 메뉴 오른쪽 끝. 폰은 아래 메뉴에 두지 않고 홈 화면(/home) 위 오른쪽에만 둔다(11/15 nnoinn).
// 종은 원장님 화면과 같은 공통 UI(AccountNotificationBell)다
// 최근 본 매물(C-212): 오른쪽 아래 둥근 사각형 버튼(폰은 아래 메뉴 위). 지금 주소를 읽어서 <Suspense> 안에 둔다
export default function CustomerTabsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <HoldProvider>
      <CustomerTopNav
        actions={
          <>
            <HoldChip />
            <AccountNotificationBell
              account={CUSTOMER_NOTIFICATION_ACCOUNT}
              href={NOTIFICATIONS_PATH}
            />
          </>
        }
      />
      <div className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] has-[[data-hold-pill]]:pt-14 has-[[data-hold-pill]]:[--hold-top:3.5rem] md:pb-0 md:has-[[data-hold-pill]]:pt-0 md:has-[[data-hold-pill]]:[--hold-top:0px]">
        {children}
        <HoldPill />
        <Suspense fallback={null}>
          <RecentButton />
        </Suspense>
      </div>
      <CustomerBottomNav />
    </HoldProvider>
  );
}
