'use client';

import { useLayoutEffect, useOptimistic, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { customerJoinPath, loginPath } from '@/server/auth/paths';

import { setFavorite } from '../../home/favorites/actions';

const SAVE_FAILED_MESSAGE = '찜을 저장하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 샵 찜 버튼 (#215 2장, C-209). 누르면 바로 하트를 바꿔 보여주고 서버에 저장한다. 실패하면 원래대로 돌아오고 안내를 띄운다.
 * 로그인 안 함·원장님 모드면 로그인 화면으로, 고객 계정이 없으면 약관 동의로 보내고 이 매물로 돌아온다(예약하기와 같게)
 */
export function FavoriteButton({
  shopId,
  slotId,
  favorite,
}: {
  shopId: string;
  slotId: string;
  /** 서버가 본 지금 찜 여부. 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
}) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(favorite);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 상세를 떠나면 Next.js가 이 화면을 숨겨 두었다가 그대로 다시 보여준다(Activity). 지난 실패 문구는 떠날 때 지운다
  useLayoutEffect(() => () => setError(null), []);

  function toggle() {
    const next = !shown;
    setError(null);
    startTransition(async () => {
      setShown(next);
      try {
        const result = await setFavorite({ shopId, favorite: next });
        if (result.ok) return;
        const here = `/slots/${slotId}`;
        switch (result.error.code) {
          case 'UNAUTHENTICATED':
          case 'WRONG_MODE':
            router.push(loginPath('customer', here));
            return;
          case 'NO_CUSTOMER_ACCOUNT':
            router.push(customerJoinPath(here));
            return;
        }
        setError(result.error.message);
      } catch (caught) {
        unstable_rethrow(caught);
        setError(SAVE_FAILED_MESSAGE);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={shown}
        disabled={pending}
        onClick={toggle}
        className="gap-1"
      >
        <Heart className={cn('size-4', shown && 'fill-primary text-primary')} aria-hidden />찜
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
