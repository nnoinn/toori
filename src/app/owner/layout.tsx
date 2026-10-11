// 업주 화면 레이아웃(PC 기준, 폰에서도 쓸 수 있게). 메뉴(대시보드/매물 등록/매장 설정/정산)는 공통 UI PR에서 넣는다.
// 화면은 정민석 담당, 레이아웃 틀은 현동훈 담당(공통 UI).
export default function OwnerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col">{children}</div>;
}
