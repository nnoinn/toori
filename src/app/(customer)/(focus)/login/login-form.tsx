'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { cn } from 'cn';

import { BackButton } from '@/components/ui/back-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Logo } from '@/components/ui/logo';
import { SITE_NAME } from '@/lib/site';
import { CUSTOMER_HOME, customerJoinPath, OWNER_JOIN_PATH } from '@/server/auth/paths';
import { signInWithProvider, switchAccountMode } from '@/server/auth/session';

import {
  LOGIN_ERROR_MESSAGES,
  type LoginErrorCode,
  type LoginMode,
  nextForMode,
} from './login-params';
import { ProviderButton, type ProviderKey } from './provider-button';

const MODES: { mode: LoginMode; label: string }[] = [
  { mode: 'customer', label: '고객' },
  { mode: 'owner', label: '원장님' },
];

const MODE_LABEL: Record<LoginMode, string> = { customer: '고객', owner: '원장님' };

// 카카오·구글을 먼저 만든다(C-101). 네이버는 강규민님 W21 뒤에 더한다
const PROVIDERS: ProviderKey[] = ['kakao', 'google'];

type LoginFormProps = {
  /**
   * login: 로그인 화면(/login). 다른 화면에서 로그인이 필요해 넘어왔다
   * first: 첫 화면(/, #215). 로그인했으면 고객·원장님 중 골라 계속하고, 안 했으면 로그인 없이 둘러볼 수도 있다
   */
  variant?: 'login' | 'first';
  initialMode: LoginMode;
  /** 주소에 있던 안전한 next. 없거나 고른 모드의 화면이 아니면 그 모드의 기본 주소로 간다(#207) */
  nextParam: string | null;
  /** 로그인 콜백이 돌려보낸 실패 이유(?error=) */
  error: LoginErrorCode | null;
  /** 이미 로그인했으면 그 이메일. 다시 로그인하지 않고 고른 계정으로 계속할 수 있다 */
  signedInEmail: string | null;
  /** 첫 화면: 이미 로그인했으면 계정마다 있는지. 없으면 "…으로 시작하기"로 가입 화면에 보낸다 */
  accounts?: Record<LoginMode, boolean>;
};

type Provider = ProviderKey;

// 서버 함수를 부르지도 못했을 때(네트워크 등). 서버의 LOGIN_UNAVAILABLE 문구와 같게 둔다
const LOGIN_START_FAILED_MESSAGE = '로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요';

/**
 * 로그인 화면 (J8, C-101)과 첫 화면(#215). 고객/원장님 토글과 간편 로그인 버튼.
 * 버튼을 누르면 signInWithProvider(#47 3장)가 카카오·구글 로그인 화면으로 보낸다.
 * 성공하면 이 화면으로 돌아오지 않고, 시작하지 못했을 때만 실패 문구를 보여준다
 */
export function LoginForm({
  variant = 'login',
  initialMode,
  nextParam,
  error,
  signedInEmail,
  accounts,
}: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(error ? LOGIN_ERROR_MESSAGES[error] : null);
  // 첫 화면은 버튼이 둘이라 어느 쪽을 눌렀는지 둔다
  const [continuingMode, setContinuingMode] = useState<LoginMode | null>(null);
  const [continuing, startContinue] = useTransition();
  const [, startTransition] = useTransition();
  // 토글로 고른 모드와 next가 맞지 않으면 그 모드의 기본 주소(#207). 간편 로그인은 이 값으로 간다
  const next = nextForMode(mode, nextParam);
  const busy = pendingProvider !== null || continuing;
  const isFirst = variant === 'first';

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
   * 이미 로그인한 사람: 고른 계정 모드로 바꾸고(switchAccountMode, #47) 보던 화면(첫 화면은 그 계정의 첫 화면)으로 간다.
   * 그 모드의 계정이 아직 없으면 가입 화면(고객 /join, 원장님 /owner/join)으로 보낸다
   */
  function continueAs(target: LoginMode) {
    setMessage(null);
    setContinuingMode(target);
    startContinue(async () => {
      try {
        const result = await switchAccountMode(target);
        if (!result.ok) {
          setMessage(result.error.message);
          return;
        }
        const to = nextForMode(target, nextParam);
        router.replace(
          result.data.hasAccount
            ? to
            : target === 'customer'
              ? customerJoinPath(to)
              : OWNER_JOIN_PATH,
        );
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

  /** 계속하기 버튼 문구. 첫 화면에서 그 계정이 아직 없으면 "…으로 시작하기"(가입으로 간다) */
  function continueLabel(target: LoginMode): string {
    if (continuing && continuingMode === target) return '이동 중…';
    const hasAccount = accounts ? accounts[target] : true;
    return `${MODE_LABEL[target]}으로 ${hasAccount ? '계속하기' : '시작하기'}`;
  }

  const modeToggle = (
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
  );

  const errorMessage = message ? (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  ) : null;

  const providers = PROVIDERS.map((provider) => (
    <ProviderButton
      key={provider}
      provider={provider}
      disabled={busy}
      pending={pendingProvider === provider}
      onClick={() => start(provider)}
    />
  ));

  /** 이미 로그인한 계정. 첫 화면은 고객·원장님 버튼을 둘 다, 로그인 화면은 토글로 고른 쪽 하나 */
  const signedIn = signedInEmail ? (
    <div className="flex flex-col gap-2 rounded-xl border p-4">
      <p className="text-sm">
        {/* 이메일 끝 글자에 따라 "로/으로"가 달라져서 "계정으로"로 맞춘다 */}
        <span className="font-semibold">{signedInEmail}</span> 계정으로 로그인돼 있어요.
      </p>
      {isFirst ? (
        <>
          <Button
            type="button"
            size="lg"
            className="h-12 text-base"
            disabled={busy}
            onClick={() => continueAs('customer')}
          >
            {continueLabel('customer')}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="h-12 text-base"
            disabled={busy}
            onClick={() => continueAs('owner')}
          >
            {continueLabel('owner')}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="lg"
          className="h-12 text-base"
          disabled={busy}
          onClick={() => continueAs(mode)}
        >
          {continueLabel(mode)}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        다른 계정으로 들어가려면 아래에서 다시 로그인해 주세요.
      </p>
    </div>
  ) : null;

  return (
    <section className="flex flex-1 flex-col gap-8 px-4 pt-2 pb-12">
      {isFirst ? <div className="h-4" aria-hidden /> : <BackButton className="-ml-2 self-start" />}
      <div className="flex flex-col items-center gap-2 text-center">
        {isFirst ? <Logo className="mb-2 h-9" /> : null}
        <h1 className="text-2xl font-bold">{SITE_NAME} 시작하기</h1>
        <p className="text-sm text-muted-foreground">
          {mode === 'customer'
            ? '내 주변 임박 할인을 예약하려면 로그인해 주세요.'
            : '매물을 올리고 예약을 관리하려면 원장님 계정으로 로그인해 주세요.'}
        </p>
      </div>

      {isFirst && signedIn ? (
        // 첫 화면에서 이미 로그인했으면 계정 고르기가 먼저다. 토글은 아래 "다른 계정으로 로그인"에만 쓴다
        <>
          {errorMessage}
          {signedIn}
          {modeToggle}
          <div className="flex flex-col gap-2">{providers}</div>
        </>
      ) : (
        <>
          {modeToggle}
          <div className="flex flex-col gap-2">
            {errorMessage}
            {signedIn}
            {providers}
          </div>
        </>
      )}

      {isFirst && !signedInEmail ? (
        // 로그인 없이 고객 화면(홈·목록·지도·매물 상세)만 둘러본다(#215). 예약·찜·내 정보는 그때 로그인한다
        <Link
          href={CUSTOMER_HOME}
          className={buttonVariants({ variant: 'ghost', className: 'self-center' })}
        >
          로그인 없이 둘러보기
        </Link>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        같은 이메일로 고객 계정과 원장님 계정을 따로 만들 수 있어요. 두 계정의 정보·예약·정산은 서로
        섞이지 않아요.
      </p>
    </section>
  );
}
