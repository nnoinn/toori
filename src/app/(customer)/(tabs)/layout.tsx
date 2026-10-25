import { CustomerBottomNav } from '@/components/ui/customer-nav';

// 아래 메뉴(홈/내 예약/내 정보)가 붙는 고객 화면: 홈, 매물 상세, 내 예약, 내 정보 (#71).
// 메뉴 높이만큼 아래를 비워 둔다.
export default function CustomerTabsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <CustomerBottomNav />
    </>
  );
}
