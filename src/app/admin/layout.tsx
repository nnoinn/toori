// 운영자 화면 레이아웃(PC 기준). 관리자만 들어온다(접근 보호는 강규민이 src/proxy.ts와 서버 함수에서 만든다).
// 화면은 강규민 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col">{children}</div>;
}
