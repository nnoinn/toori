import { Google_Sans } from 'next/font/google';
import Image from 'next/image';
import { cn } from 'cn';

import googleLogo from './google-g-logo.png';
import { PROVIDER_LABELS, type ProviderKey } from './provider-labels';

export type { ProviderKey };

// 간편 로그인 버튼 (C-101). 카카오·구글 공식 버튼 디자인 가이드를 따른다(10/28).
// - 카카오: 배경 #FEE500, 말풍선 심볼(모양·비율·색 변경 불가, 심볼 없이 쓰지 않음), 문구 "카카오 로그인", 글자 85%, 모서리 12px
//   https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide
// - 구글(Light): 흰 배경, 테두리 #747775, 글자 #1F1F1F, 표준 색 "G" 로고(색·크기 변경 불가), 현지화한 "Sign in with Google"
//   https://developers.google.com/identity/branding-guidelines
// 색과 글꼴은 globals.css의 kakao·google 토큰에서만 가져온다.
// 글꼴: 카카오 "OS 기본 시스템 서체"(30pt ≒ 웹 15px), 구글 "Google Sans Medium 14/20"

// Google Sans에는 한글이 없어서 라틴 글자만 받는다. 한글은 globals.css --font-google의 기기 기본 서체로 보인다.
// adjustFontFallback: Next.js에 Google Sans 크기 맞춤값이 없어서(빌드 경고) 끈다. 버튼 높이가 고정이라 흔들림은 없다
const googleSans = Google_Sans({
  weight: '500',
  subsets: ['latin'],
  variable: '--font-google-sans',
  display: 'swap',
  adjustFontFallback: false,
});

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
        'relative flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] px-4 transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
        isKakao
          ? 'bg-kakao font-kakao text-[15px] font-semibold text-kakao-foreground hover:opacity-90'
          : cn(
              googleSans.variable,
              'border border-google-border bg-google font-google text-[14px] leading-5 font-medium text-google-foreground hover:bg-muted',
            ),
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
