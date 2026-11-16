import { Google_Sans } from 'next/font/google';
import Image from 'next/image';
import { cn } from 'cn';

import googleLogo from './google-g-logo.png';
import naverLogo from './naver-n-logo.png';
import { PROVIDER_LABELS, PROVIDER_ORDER, type ProviderKey } from './provider-labels';

export type { ProviderKey };
export { PROVIDER_ORDER };

// 간편 로그인 버튼 (C-101). 카카오·구글·네이버 공식 버튼 디자인 가이드를 따른다(10/28, 네이버 11/15).
// 버튼 순서는 PROVIDER_ORDER(카카오·네이버·구글) 하나만 쓴다.
// - 카카오: 배경 #FEE500, 말풍선 심볼(모양·비율·색 변경 불가, 심볼 없이 쓰지 않음), 문구 "카카오 로그인", 글자 85%, 모서리 12px
//   https://developers.kakao.com/docs/latest/ko/kakaologin/design-guide
// - 구글(Light): 흰 배경, 테두리 #747775, 글자 #1F1F1F, 표준 색 "G" 로고(색·크기 변경 불가), 현지화한 "Sign in with Google"
//   https://developers.google.com/identity/branding-guidelines
// - 네이버(Light, 가운데 정렬형): 배경 #03A94D(지정 컬러, 변경 불가), 흰 N 로고 16px, 흰 글자 "네이버 로그인"
//   https://developers.naver.com/docs/login/bi/bi.md
//   N 로고는 공식 버튼 애셋(NAVER_login_KR의 Light_KR_green_center_H48, 4배 크기)에서 로고만 잘라 배경을 투명하게 했다
//   (naver-n-logo.png, 64×64. 모양·색은 그대로). 애셋의 높이 48px 버튼에서 로고가 16px이라 같은 크기로 둔다
// 색과 글꼴은 globals.css의 kakao·google·naver 토큰에서만 가져온다.
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
  /** 이 기기에서 가장 최근에 로그인한 방식이면 테두리와 "최근 로그인" 표시(11/16 nnoinn, AUTH-15) */
  recent?: boolean;
  onClick: () => void;
};

/** 최근 로그인 표시(11/16 nnoinn 시안 C): 검정 테두리와 검정 라벨. 테두리 바깥 틈은 버튼 바탕(폰: 화면 바탕, PC: 흰 카드) 색이다 */
const RECENT_RING =
  'ring-2 ring-foreground ring-offset-2 ring-offset-background md:ring-offset-card';
const RECENT_BADGE = 'bg-foreground text-background';
/** 최근 로그인 표시 문구(11/16 nnoinn) */
export const RECENT_LOGIN_LABEL = '최근 로그인';

// 구글 버튼 시안 고르기용(임시): light 지금(흰 바탕·회색 테두리), neutral(연회색 바탕·테두리 없음), dark(검정 바탕)
const GOOGLE_THEME = 'light' as 'light' | 'neutral' | 'dark';
const GOOGLE_THEME_STYLES = {
  light: 'border border-google-border bg-google text-google-foreground hover:bg-muted',
  neutral: 'bg-[#f2f2f2] text-[#1f1f1f] hover:opacity-90',
  dark: 'border border-[#8e918f] bg-[#131314] text-[#e3e3e3] hover:opacity-90',
}[GOOGLE_THEME];

/** 제공자마다 다른 모양(배경·글자·글꼴). 둥근 모서리와 높이는 같다 */
const PROVIDER_STYLES: Record<ProviderKey, string> = {
  kakao: 'bg-kakao font-kakao text-[15px] font-semibold text-kakao-foreground hover:opacity-90',
  google: cn(
    googleSans.variable,
    'font-google text-[14px] leading-5 font-medium',
    GOOGLE_THEME_STYLES,
  ),
  // 네이버 가이드에 글꼴 지정이 없어서 카카오처럼 기기 기본 서체를 쓴다
  naver: 'bg-naver font-kakao text-[15px] font-semibold text-naver-foreground hover:opacity-90',
};

export function ProviderButton({
  provider,
  disabled,
  pending,
  recent,
  onClick,
}: ProviderButtonProps) {
  return (
    <button
      type="button"
      data-provider={provider}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex h-12 w-full items-center justify-center gap-2.5 rounded-[12px] px-4 transition-opacity outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60',
        PROVIDER_STYLES[provider],
        recent && RECENT_RING,
      )}
    >
      {provider === 'kakao' ? (
        <KakaoSymbol className="size-[18px] shrink-0 text-kakao-symbol" />
      ) : provider === 'google' ? (
        // 가로·세로를 CSS로 같이 정한다. 기본 스타일(height: auto)만 바뀌면 Next.js가 비율 경고를 낸다
        <Image src={googleLogo} alt="" width={18} height={18} className="size-[18px] shrink-0" />
      ) : (
        <Image src={naverLogo} alt="" width={16} height={16} className="size-4 shrink-0" />
      )}
      <span>{pending ? '로그인 화면으로 이동 중…' : PROVIDER_LABELS[provider]}</span>
      {recent ? (
        // 버튼 오른쪽 위 테두리에 걸친 라벨. 버튼 이름에 같이 읽힌다("카카오 로그인 최근 로그인")
        <span
          className={cn(
            'absolute -top-2.5 right-3 rounded-full px-2 py-0.5 font-sans text-xs leading-4 font-semibold shadow-sm',
            RECENT_BADGE,
          )}
        >
          {RECENT_LOGIN_LABEL}
        </span>
      ) : null}
    </button>
  );
}
