'use client';

import { useState } from 'react';
import { cn } from 'cn';

import { Button } from '@/components/ui/button';
import { SITE_NAME } from '@/lib/site';

import { DEFAULT_NEXT, type LoginMode } from './login-params';

const MODES: { mode: LoginMode; label: string }[] = [
  { mode: 'customer', label: '고객' },
  { mode: 'owner', label: '원장님' },
];

const PROVIDERS = [
  { provider: 'kakao', label: '카카오로 시작하기' },
  { provider: 'google', label: '구글로 시작하기' },
] as const;

type LoginFormProps = {
  initialMode: LoginMode;
  /** 주소에 있던 안전한 next. 없으면 고른 모드의 기본 주소로 돌아간다 */
  nextParam: string | null;
};

/** 로그인 화면 (J8, C-101). 고객/원장님 토글과 간편 로그인 버튼 */
export function LoginForm({ initialMode, nextParam }: LoginFormProps) {
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const next = nextParam ?? DEFAULT_NEXT[mode];

  return (
    <section className="flex flex-1 flex-col gap-8 px-4 py-12">
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
        {PROVIDERS.map(({ provider, label }) => (
          // TODO(#47 3장): 강규민님 signInWithProvider({ provider, mode, next })가 들어오면 연결하고 disabled를 뗀다
          <Button
            key={provider}
            type="button"
            variant="outline"
            size="lg"
            className="h-12 text-base"
            disabled
            data-provider={provider}
            data-next={next}
          >
            {label}
          </Button>
        ))}
        <p className="text-center text-xs text-muted-foreground">로그인 연결은 준비 중이에요.</p>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        같은 이메일로 고객 계정과 원장님 계정을 따로 만들 수 있어요. 두 계정의 정보·예약·정산은 서로
        섞이지 않아요.
      </p>
    </section>
  );
}
