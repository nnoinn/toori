import { OwnerNav } from '@/components/ui/owner-nav';

// 업주 화면 레이아웃(PC 기준, 폰에서는 위쪽 메뉴 버튼). 화면은 정민석 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
// 입점 승인 상태를 읽을 수 있게 되면(연결 #13) OwnerNav에 canCreateSlot을 넘긴다.
// 접근 보호: proxy가 1차로 막고, 이 레이아웃과 서버 함수에서 requireOwner()로 한 번 더 확인한다(강규민, 로드맵 W3).
export default function OwnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col md:flex-row">
      <OwnerNav />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
