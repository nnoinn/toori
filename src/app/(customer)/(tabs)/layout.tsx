import { CustomerBottomNav, CustomerTopNav } from '@/components/ui/customer-nav';

// 메뉴(홈/내 예약/내 정보)가 붙는 고객 화면: 홈, 매물 상세, 내 예약, 내 정보 (#71).
// 폰은 아래 메뉴(높이만큼 아래를 비운다), PC(md 이상)는 위쪽 메뉴. 화면 안쪽 폭은 각 화면이 정한다(기술 가이드 "PC 화면")
export default function CustomerTabsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <CustomerTopNav />
      <div className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
      <CustomerBottomNav />
    </>
  );
}
