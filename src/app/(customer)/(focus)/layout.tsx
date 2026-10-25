// 메뉴 없이 한 가지 일을 끝내는 고객 화면: 로그인 /login, 약관 동의 /join, 예약 확인·결제 (#71).
// 결제 중(10분 홀딩)에 다른 탭으로 빠져나가지 않게 메뉴를 두지 않고, 화면마다 왼쪽 위에 뒤로가기(BackButton)를 둔다.
// 폰은 화면 전체, PC(md 이상)는 가운데 흰 카드(폭 480px)에 담는다.
export default function CustomerFocusLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col md:items-center md:px-6 md:py-12">
      <div className="flex flex-1 flex-col md:w-full md:max-w-[480px] md:flex-none md:overflow-hidden md:rounded-2xl md:border md:bg-card md:shadow-sm">
        {children}
      </div>
    </div>
  );
}
