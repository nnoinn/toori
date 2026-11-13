'use client';

import { useLayoutEffect, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Bell, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { customerJoinPath, loginPath } from '@/server/auth/paths';

import { INTEREST_AREA_NOTE, INTEREST_NEEDS_CONSENT } from '../../me/interest-area-rules';
import { ConsentResult, useOptionalConsent } from '../../me/consent-switch';
import { watchListArea } from './actions';
import { AreaDevicePush } from './area-device-push';

const SAVE_FAILED_MESSAGE = '관심 동네로 등록하지 못했어요. 잠시 후 다시 시도해 주세요';

/** 서버가 본 지금 상태. 고객으로 로그인하지 않았으면 null */
export type AreaAlertState = { watching: boolean; interestAlertAgreed: boolean };

/**
 * 매물 없는 동네의 새 매물 알림 권유 (C-208, J15). 매물 목록이 비었을 때 빈 화면 아래에 보여준다.
 * 누르면 그 동네를 바로 관심 동네로 등록한다(내 정보 관심 동네와 같은 저장). 관심 동네·찜한 샵 알림 동의가 없으면
 * 이 자리에서 동의를 받는다(D15, #267, 내 정보와 같은 동의 처리). 동의까지 끝나면 이 기기 푸시 알림 켜기를 보여준다.
 * 로그인 안 함·원장님 모드면 로그인 뒤 이 목록으로 돌아온다
 */
export function AreaAlert({
  areaCode,
  areaLabel,
  state,
}: {
  areaCode: string;
  /** 동네 이름. 예: 안산시 단원구 */
  areaLabel: string;
  state: AreaAlertState | null;
}) {
  const router = useRouter();
  const serverWatching = state?.watching ?? false;
  const [watching, setWatching] = useState(serverWatching);
  // 화면을 떠났다 와도 예전 상태가 남으므로(Activity) 서버 값이 바뀌었으면 맞춘다(내 정보에서 관심 동네를 뺀 경우 등)
  const [lastServerWatching, setLastServerWatching] = useState(serverWatching);
  if (lastServerWatching !== serverWatching) {
    setLastServerWatching(serverWatching);
    setWatching(serverWatching);
  }
  const consent = useOptionalConsent('interest_alert', state?.interestAlertAgreed ?? false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // 지난 실패 문구는 화면을 떠날 때 지운다(Activity)
  useLayoutEffect(() => () => setError(null), []);

  function watch() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await watchListArea(areaCode);
        if (result.ok) {
          setWatching(true);
          return;
        }
        const here = `${window.location.pathname}${window.location.search}`;
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

  if (!watching) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">{areaLabel}에 새 매물이 올라오면 알려 드릴까요?</p>
        <Button type="button" size="sm" className="gap-1" disabled={pending} onClick={watch}>
          <Bell className="size-4" aria-hidden />
          {pending ? '등록하는 중…' : '새 매물 알림 받기'}
        </Button>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-2 rounded-xl border bg-card p-4 text-sm">
      <p role="status" className="flex items-center gap-1 font-medium text-primary">
        <Check className="size-4" aria-hidden />
        관심 동네로 등록된 동네예요
      </p>
      <p className="text-xs text-muted-foreground">{INTEREST_AREA_NOTE}</p>
      {consent.agreed ? null : (
        <>
          <p>{INTEREST_NEEDS_CONSENT}</p>
          <Button
            type="button"
            size="sm"
            disabled={consent.pending}
            onClick={() => consent.change(true)}
          >
            {consent.pending ? '처리하는 중…' : '동의하고 알림 받기'}
          </Button>
        </>
      )}
      <ConsentResult message={consent.message} />
      {consent.agreed ? <AreaDevicePush /> : null}
    </div>
  );
}
