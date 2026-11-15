// 간편 로그인 버튼 문구 (C-101). 카카오·구글 디자인 가이드가 허용하는 문구만 쓴다.
// next/font를 쓰는 provider-button.tsx와 나눠서 테스트에서도 읽을 수 있게 했다.

export type ProviderKey = 'kakao' | 'google';

export const PROVIDER_LABELS: Record<ProviderKey, string> = {
  // 카카오 가이드가 허용하는 완성형 문구
  kakao: '카카오 로그인',
  // "Sign in with Google"의 한국어(구글 공식 한국어 버튼 문구)
  google: 'Google 계정으로 로그인',
};
