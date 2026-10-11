// 고객 화면 레이아웃(폰 기준). 하단 메뉴(홈/내 예약/내 정보)는 공통 UI PR에서 넣는다.
// 화면은 정찬형 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">{children}</div>;
}
