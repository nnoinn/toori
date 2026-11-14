import { CustomerBottomNav, CustomerTopNav } from '@/components/ui/customer-nav';

import { HoldBar } from './hold-bar';

// 메뉴(홈/내 예약/내 정보)가 붙는 고객 화면: 홈, 매물 상세, 내 예약, 내 정보 (#71).
// 폰은 아래 메뉴(높이만큼 아래를 비운다), PC(md 이상)는 위쪽 메뉴. 화면 안쪽 폭은 각 화면이 정한다(기술 가이드 "PC 화면")
// 결제 중인 매물이 있으면 아래쪽에 결제 중 막대(HoldBar, 높이 3.5rem)가 뜬다(#359 1번). 막대가 있는 동안 --hold-bar-h에
// 그 높이를 넣어 아래를 그만큼 더 비운다. 화면 높이를 직접 정하는 홈과 아래에 고정한 [예약하기] 칸도 이 값을 쓴다
export default function CustomerTabsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <CustomerTopNav />
      <div className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom)+var(--hold-bar-h,0px))] has-[[data-hold-bar]]:[--hold-bar-h:3.5rem] md:pb-[var(--hold-bar-h,0px)]">
        {children}
        <HoldBar />
      </div>
      <CustomerBottomNav />
    </>
  );
}
