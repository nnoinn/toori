import { Suspense } from 'react';

import { AdminNav } from '@/components/ui/admin-nav';

import { AdminTopBar, isAdminSession } from './admin-top-bar';

// 운영자 화면 레이아웃(PC 기준). 화면은 강규민 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
// 접근 보호: proxy가 1차로 막고(운영자 모드가 아니면 운영자 입구로), 화면과 서버 함수에서 requireAdmin()으로 한 번 더 확인한다.
// 운영자 입구(/admin/login)도 이 레이아웃 안이라, 메뉴와 위쪽 이름·[로그아웃]은 운영자로 들어왔을 때만 그린다(#372).
// 로그인 확인은 <Suspense> 안에서 한다(기술 가이드 2장)
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col md:flex-row">
      <Suspense fallback={null}>
        <AdminNavForAdmin />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <AdminTopBar />
        </Suspense>
        {children}
      </div>
    </div>
  );
}

async function AdminNavForAdmin() {
  return (await isAdminSession()) ? <AdminNav /> : null;
}
