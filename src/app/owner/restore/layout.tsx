import { Logo } from '@/components/ui/logo';

// 원장님 계정 되살리기 /owner/restore (#154 3장). 원장님 계정이 탈퇴 상태라 메뉴가 있는 원장님 화면 묶음((console))과 나눴다.
// 가입 화면(/owner/join)처럼 메뉴 없이 가운데 카드에 담는다. 입력 칸이 없어서 가입보다 좁게 둔다. PC 기준
export default function OwnerRestoreLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-4 py-8 md:px-6 md:py-12">
      <Logo className="h-7" />
      <div className="flex w-full max-w-lg flex-col">{children}</div>
    </div>
  );
}
