'use client';

import { useEffect, useState, useTransition } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { cn } from 'cn';

import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { SITE_NAME } from '@/lib/site';
import { customerJoinPath, OWNER_JOIN_PATH } from '@/server/auth/paths';
import { signInWithProvider, switchAccountMode } from '@/server/auth/session';

import {
  DEFAULT_NEXT,
  LOGIN_ERROR_MESSAGES,
  type LoginErrorCode,
  type LoginMode,
} from './login-params';
import { ProviderButton, type ProviderKey } from './provider-button';

const MODES: { mode: LoginMode; label: string }[] = [
  { mode: 'customer', label: '고객' },
  { mode: 'owner', label: '원장님' },
];

// 카카오·구글을 먼저 만든다(C-101). 네이버는 강규민님 W21 뒤에 더한다
const PROVIDERS: ProviderKey[] = ['kakao', 'google'];

type LoginFormProps = {
  initialMode: LoginMode;
  /** 주소에 있던 안전한 next. 없으면 고른 모드의 기본 주소로 돌아간다 */
  nextParam: string | null;
  /** 로그인 콜백이 돌려보낸 실패 이유(?error=) */
  error: LoginErrorCode | null;
  /** 이미 로그인했으면 그 이메일. 다시 로그인하지 않고 고른 계정으로 계속할 수 있다 */
  signedInEmail: string | null;
};

type Provider = ProviderKey;

// 서버 함수를 부르지도 못했을 때(네트워크 등). 서버의 LOGIN_UNAVAILABLE 문구와 같게 둔다
const LOGIN_START_FAILED_MESSAGE = '로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 로그인 화면 (J8, C-101). 고객/원장님 토글과 간편 로그인 버튼.
 * 버튼을 누르면 signInWithProvider(#47 3장)가 카카오·구글 로그인 화면으로 보낸다.
 * 성공하면 이 화면으로 돌아오지 않고, 시작하지 못했을 때만 실패 문구를 보여준다
 */
export function LoginForm({ initialMode, nextParam, error, signedInEmail }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(error ? LOGIN_ERROR_MESSAGES[error] : null);
  const [continuing, startContinue] = useTransition();
  const [, startTransition] = useTransition();
  const next = nextParam ?? DEFAULT_NEXT[mode];
  const busy = pendingProvider !== null || continuing;

  // 카카오·구글 화면에서 뒤로가기로 돌아오면 브라우저가 이 화면을 그대로 되살려서(bfcache)
  // 버튼이 "이동 중…"으로 멈춰 있다. 돌아오면 다시 누를 수 있게 푼다
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPendingProvider(null);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  /**
   * 이미 로그인한 사람: 고른 계정 모드로 바꾸고(switchAccountMode, #47) 보던 화면으로 간다.
   * 그 모드의 계정이 아직 없으면 가입 화면(고객 /join, 원장님 /owner/join)으로 보낸다
   */
  function continueSignedIn() {
    setMessage(null);
    startContinue(async () => {
      try {
        const result = await switchAccountMode(mode);
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        const to = result.data.hasAccount
          ? next
          : mode === 'customer'
            ? customerJoinPath(next)
            : OWNER_JOIN_PATH;
        router.replace(to);
        router.refresh();
      } catch (error) {
        unstable_rethrow(error);
        setMessage(LOGIN_START_FAILED_MESSAGE);
      }
    });
  }

  function start(provider: Provider) {
    setMessage(null);
    setPendingProvider(provider);
    startTransition(async () => {
      try {
        // 성공하면 서버가 카카오·구글로 보내서 아래로 내려오지 않는다
        const result = await signInWithProvider({ provider, mode, next });
        if (!result.ok) {
          setMessage(result.error.message);
          setPendingProvider(null);
        }
      } catch (error) {
        // 화면 이동(redirect) 같은 Next.js 내부 신호는 다시 던진다. 그 밖(네트워크 등)은 안내만 한다
        unstable_rethrow(error);
        setMessage(LOGIN_START_FAILED_MESSAGE);
        setPendingProvider(null);
      }
    });
  }

  return (
    <section className="flex flex-1 flex-col gap-8 px-4 pt-2 pb-12">
      <BackButton className="-ml-2 self-start" />
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">{SITE_NAME} 시작하기</h1>
        <p className="text-sm text-muted-foreground">
          {mode === 'customer'
            ? '내 주변 임박 할인을 예약하려면 로그인해 주세요.'
            : '매물을 올리고 예약을 관리하려면 원장님 계정으로 로그인해 주세요.'}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="계정 종류"
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
      >
        {MODES.map((item) => (
          <button
            key={item.mode}
            type="button"
            role="radio"
            aria-checked={mode === item.mode}
            className={cn(
              'h-10 rounded-lg text-sm font-semibold transition-colors',
              mode === item.mode ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
            onClick={() => setMode(item.mode)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {message ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {message}
          </p>
        ) : null}
        {signedInEmail ? (
          <div className="flex flex-col gap-2 rounded-xl border p-4">
            <p className="text-sm">
              <span className="font-semibold">{signedInEmail}</span>로 로그인돼 있어요.
            </p>
            <Button
              type="button"
              size="lg"
              className="h-12 text-base"
              disabled={busy}
              onClick={continueSignedIn}
            >
              {continuing ? '이동 중…' : `${mode === 'customer' ? '고객' : '원장님'}으로 계속하기`}
            </Button>
            <p className="text-xs text-muted-foreground">
              다른 계정으로 들어가려면 아래에서 다시 로그인해 주세요.
            </p>
          </div>
        ) : null}
        {PROVIDERS.map((provider) => (
          <ProviderButton
            key={provider}
            provider={provider}
            disabled={busy}
            pending={pendingProvider === provider}
            onClick={() => start(provider)}
          />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        같은 이메일로 고객 계정과 원장님 계정을 따로 만들 수 있어요. 두 계정의 정보·예약·정산은 서로
        섞이지 않아요.
      </p>
    </section>
  );
}
