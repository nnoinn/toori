import Image from 'next/image';
import { cn } from 'cn';

import googleLogo from './google-g-logo.png';

// 간편 로그인 버튼 (C-101). 카카오·구글 공식 버튼 디자인 가이드를 따른다(10/28).
// - 카카오: 배경 #FEE500, 말풍선 심볼(모양·비율·색 변경 불가, 심볼 없이 쓰지 않음), 문구 "카카오 로그인", 글자 85%, 모서리 12px
//   https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide
// - 구글(Light): 흰 배경, 테두리 #747775, 글자 #1F1F1F, 표준 색 "G" 로고(색·크기 변경 불가), 현지화한 "Sign in with Google"
//   https://developers.google.com/identity/branding-guidelines
// 색은 globals.css의 kakao·google 토큰에서만 가져온다.

export type ProviderKey = 'kakao' | 'google';

/** 카카오 말풍선 심볼. 경로는 공식 리소스(login-simple-ko.svg)의 심볼 그대로, 둘레만 심볼에 맞춰 잘랐다 */
function KakaoSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="27 16.5 13 13" aria-hidden className={className}>
      <path
        fill="currentColor"
        d="m33.501 16.5225c-3.5788 0-6.4785 2.4812-6.4785 5.5416 0 1.9671 1.1994 3.6955 3.0067 4.6782l-.6111 2.469c-.0227.0737-.0049.1527.0438.2071.0356.0386.0842.0596.1312.0596.0406 0 .0811-.014.1151-.0439l2.6258-1.9197c.3777.0579.7667.0895 1.1654.0895 3.5773 0 6.4786-2.4813 6.4786-5.5416s-2.8997-5.5398-6.477-5.5398z"
      />
    </svg>
  );
}

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  // 카카오 가이드가 허용하는 완성형 문구
  kakao: '카카오 로그인',
  // "Sign in with Google"의 한국어(구글 공식 한국어 버튼 문구)
  google: 'Google 계정으로 로그인',
};

type ProviderButtonProps = {
  provider: ProviderKey;
  /** 누르는 중(다른 버튼도 함께 잠근다) */
  disabled?: boolean;
  /** 누른 버튼이면 문구 대신 이동 중 안내 */
  pending?: boolean;
  onClick: () => void;
};

export function ProviderButton({ provider, disabled, pending, onClick }: ProviderButtonProps) {
  const isKakao = provider === 'kakao';
  return (
    <button
      type="button"
      data-provider={provider}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] px-4 text-[15px] font-semibold transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
        isKakao
          ? 'bg-kakao text-kakao-foreground hover:opacity-90'
          : 'border border-google-border bg-google text-google-foreground hover:bg-muted',
      )}
    >
      {isKakao ? (
        <KakaoSymbol className="size-[18px] shrink-0 text-kakao-symbol" />
      ) : (
        <Image src={googleLogo} alt="" width={18} height={18} className="shrink-0" />
      )}
      <span>{pending ? '로그인 화면으로 이동 중…' : PROVIDER_LABELS[provider]}</span>
    </button>
  );
}
