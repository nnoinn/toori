import { AdminNav } from '@/components/ui/admin-nav';

// 운영자 화면 레이아웃(PC 기준). 화면은 강규민 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
// 접근 보호: proxy가 1차로 막고, 이 레이아웃과 서버 함수에서 requireAdmin()으로 한 번 더 확인한다(강규민, 로드맵 W3).
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col md:flex-row">
      <AdminNav />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
