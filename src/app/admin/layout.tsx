import { Suspense } from 'react';

import { AdminNav } from '@/components/ui/admin-nav';

import { AdminTopBar } from './admin-top-bar';
import { CronWarning } from './cron-warning';

// 운영자 화면 레이아웃(PC 기준). 화면은 강규민 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
// 접근 보호: proxy가 1차로 막고(운영자 모드가 아니면 운영자 입구로), 화면과 서버 함수에서 requireAdmin()으로 한 번 더 확인한다.
// 운영자 입구(/admin/login)도 이 레이아웃 안이라 입구에서는 메뉴를 숨긴다(#372). 메뉴는 늘 그리고(미리 그리는 화면에도 들어가서
// 새로 고칠 때 메뉴가 늦게 들어오며 본문이 밀리지 않는다), 입구 화면의 data-admin-login 표시를 CSS(:has)로 보고 숨긴다.
// 위쪽 이름·[로그아웃]은 운영자로 들어왔을 때만 그린다(로그인 확인은 <Suspense> 안에서, 기술 가이드 2장)
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="group/admin mx-auto flex min-h-dvh w-full max-w-7xl flex-col md:flex-row">
      <div className="contents group-has-data-admin-login/admin:hidden">
        <AdminNav />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={null}>
          <AdminTopBar />
        </Suspense>
        {/* 예약 작업 경고 한 줄(#373 ⑥). 문제가 있을 때만 그린다 */}
        <Suspense fallback={null}>
          <CronWarning />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
