'use client';

import { useLayoutEffect, useOptimistic, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { customerJoinPath, loginPath } from '@/server/auth/paths';

import { setFavorite } from '../../home/favorites/actions';
import { AreaDevicePush } from '../../home/list/area-device-push';
import { ConsentResult, useOptionalConsent } from '../../me/consent-switch';
import { FAVORITE_ALERT_NOTE, FAVORITE_NEEDS_CONSENT } from '../../me/interest-area-rules';

const SAVE_FAILED_MESSAGE = '찜을 저장하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 샵 찜 버튼 (#215 2장, C-209). 누르면 바로 하트를 바꿔 보여주고 서버에 저장한다. 실패하면 원래대로 돌아오고 안내를 띄운다.
 * 로그인 안 함·원장님 모드면 로그인 화면으로, 고객 계정이 없으면 약관 동의로 보내고 이 화면(매물·시간대 상세)으로 돌아온다(예약하기와 같게).
 * 찜을 눌렀는데 관심 동네·찜한 샵 알림 동의가 없으면 그 순간에만 동의를 권하고, 동의하면 이 기기 푸시 알림 켜기를 보여준다(#270 3번).
 * 찜 저장은 동의와 상관없이 된다
 */
export function FavoriteButton({
  shopId,
  returnPath,
  favorite,
  interestAlertAgreed,
}: {
  shopId: string;
  /** 로그인·약관 동의 뒤 돌아올 주소(지금 보고 있는 상세) */
  returnPath: string;
  /** 서버가 본 지금 찜 여부. 고객으로 로그인하지 않았으면 false */
  favorite: boolean;
  /** 관심 동네·찜한 샵 새 매물 알림에 동의했는지 */
  interestAlertAgreed: boolean;
}) {
  const router = useRouter();
  const [shown, setShown] = useOptimistic(favorite);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const consent = useOptionalConsent('interest_alert', interestAlertAgreed);
  /** 이번에 찜을 눌러 알림 동의를 권하는 중인지. 이미 찜한 샵을 다시 볼 때는 권하지 않는다 */
  const [askConsent, setAskConsent] = useState(false);
  // 상세를 떠나면 Next.js가 이 화면을 숨겨 두었다가 그대로 다시 보여준다(Activity). 지난 실패 문구와 동의 권유는 떠날 때 지운다
  useLayoutEffect(
    () => () => {
      setError(null);
      setAskConsent(false);
    },
    [],
  );

  function toggle() {
    const next = !shown;
    setError(null);
    if (!next) setAskConsent(false);
    startTransition(async () => {
      setShown(next);
      try {
        const result = await setFavorite({ shopId, favorite: next });
        if (result.ok) {
          if (next && !consent.agreed) setAskConsent(true);
          return;
        }
        const here = returnPath;
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
    // 폰에서는 이 묶음을 풀어서(contents) 버튼은 샵 이름 옆에, 실패 문구·동의 안내는 아래 줄 전체에 둔다
    <div className="flex flex-col items-end gap-1 max-md:contents">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={shown}
        disabled={pending}
        onClick={toggle}
        className="gap-1 max-md:h-10 max-md:px-3"
      >
        <Heart className={cn('size-4', shown && 'fill-primary text-primary')} aria-hidden />찜
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive max-md:order-last max-md:w-full">
          {error}
        </p>
      ) : null}
      {askConsent && shown ? (
        <div className="flex w-72 max-w-full flex-col items-start gap-2 rounded-xl border bg-card p-3 text-sm max-md:order-last max-md:w-full">
          {consent.agreed ? (
            <AreaDevicePush />
          ) : (
            <>
              <p className="font-medium">{FAVORITE_NEEDS_CONSENT}</p>
              <p className="text-xs text-muted-foreground">{FAVORITE_ALERT_NOTE}</p>
              <Button
                type="button"
                size="sm"
                className="max-md:h-10"
                disabled={consent.pending}
                onClick={() => consent.change(true)}
              >
                {consent.pending ? '처리하는 중…' : '동의하고 알림 받기'}
              </Button>
            </>
          )}
          <ConsentResult message={consent.message} />
        </div>
      ) : null}
    </div>
  );
}
