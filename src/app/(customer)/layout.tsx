// 고객 화면 공통 틀(폰 기준, 최대 폭 480px). 화면은 정찬형 담당, 틀은 현동훈 담당(공통 UI).
// 아래 메뉴가 있는 화면은 (tabs)/, 메뉴 없이 한 가지 일을 끝내는 화면은 (focus)/에 둔다(#71).
// 괄호 폴더는 주소에 나타나지 않는다. 두 묶음에 같은 주소를 두지 않는다(겹치면 빌드 오류).
export default function CustomerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col">{children}</div>;
}
