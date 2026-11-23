'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { canGoBackInApp, type HistorySnapshot } from './back-button-rules';

/** Navigation API에서 쓰는 부분만(TypeScript 기본 타입에 window.navigation이 아직 없다) */
type NavigationLike = { currentEntry: { index: number } | null };

function historySnapshot(): HistorySnapshot {
  const navigation = (window as Window & { navigation?: NavigationLike }).navigation;
  return {
    navigationIndex: navigation?.currentEntry ? navigation.currentEntry.index : null,
    historyLength: window.history.length,
  };
}

type BackButtonProps = {
  /** 돌아갈 이전 화면이 없을 때(주소로 바로 들어옴) 갈 곳 */
  fallbackHref?: string;
  className?: string;
};

/**
 * 왼쪽 위 뒤로가기. 아래 메뉴가 없는 화면(로그인·약관·결제)에서 쓴다.
 * 투리 안의 이전 화면이 있으면 뒤로, 없으면(새 탭·다른 사이트에서 주소로 바로 들어옴) fallbackHref로 간다(#533)
 */
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
        if (canGoBackInApp(historySnapshot())) router.back();
        else router.push(fallbackHref);
      }}
    >
      <ChevronLeft className="size-6" />
    </Button>
  );
}
