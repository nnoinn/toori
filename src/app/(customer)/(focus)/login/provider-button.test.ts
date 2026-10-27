import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROVIDER_LABELS } from './provider-button';

describe('간편 로그인 버튼', () => {
  it('문구는 카카오·구글 디자인 가이드가 허용하는 것만 쓴다', () => {
    // 카카오: 완성형 "카카오 로그인"(축약형 "로그인"), 구글: "Sign in with Google"의 한국어
    expect(PROVIDER_LABELS.kakao).toBe('카카오 로그인');
    expect(PROVIDER_LABELS.google).toBe('Google 계정으로 로그인');
  });

  it('버튼 색은 globals.css 토큰에 가이드 값 그대로 있다', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toContain('--kakao: #fee500;');
    expect(css).toContain('--kakao-symbol: #000000;');
    expect(css).toContain('--kakao-foreground: rgb(0 0 0 / 0.85);');
    expect(css).toContain('--google: #ffffff;');
    expect(css).toContain('--google-foreground: #1f1f1f;');
    expect(css).toContain('--google-border: #747775;');
  });
});
