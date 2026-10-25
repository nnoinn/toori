'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

type BackButtonProps = {
  /** 돌아갈 이전 화면이 없을 때(주소로 바로 들어옴) 갈 곳 */
  fallbackHref?: string;
  className?: string;
};

/** 왼쪽 위 뒤로가기. 아래 메뉴가 없는 화면(로그인·약관·결제)에서 쓴다 */
export function BackButton({ fallbackHref = '/', className }: BackButtonProps) {
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className={className}
      aria-label="뒤로 가기"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ChevronLeft className="size-6" />
    </Button>
  );
}
