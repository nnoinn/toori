import { CustomerBottomNav } from '@/components/ui/customer-nav';

// 고객 화면 레이아웃(폰 기준, 최대 폭 480px). 아래에 하단 메뉴(홈/내 예약/내 정보)가 붙는다.
// 화면은 정찬형 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">
      <div className="flex flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
