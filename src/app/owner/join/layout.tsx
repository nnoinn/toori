import { Logo } from '@/components/ui/logo';

// 원장님 가입 /owner/join (O7 ①, #23 D18). 원장님 계정이 아직 없어서 메뉴가 있는 원장님 화면 묶음((console))과 나눴다.
// 메뉴 없이 가운데 카드에 담는다. 입력 칸이 많아서 고객 가입(480px)보다 넓게 둔다. PC 기준
export default function OwnerJoinLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-4 py-8 md:px-6 md:py-12">
      <Logo className="h-7" />
      <div className="flex w-full max-w-2xl flex-col">{children}</div>
    </div>
  );
}
