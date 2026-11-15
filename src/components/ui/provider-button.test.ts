import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PROVIDER_LABELS, PROVIDER_ORDER } from './provider-labels';

describe('간편 로그인 버튼', () => {
  it('버튼 순서는 카카오·네이버·구글이고, 버튼이 있는 화면은 모두 이 순서를 쓴다(11/15 nnoinn)', () => {
    expect(PROVIDER_ORDER).toEqual(['kakao', 'naver', 'google']);
    for (const file of [
      'src/app/(customer)/(focus)/login/login-form.tsx',
      'src/app/admin/login/admin-login-form.tsx',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).toContain('PROVIDER_ORDER.map(');
      // 화면마다 따로 적은 순서가 없다
      expect(source).not.toMatch(/\[\s*'kakao',\s*'(google|naver)'/);
    }
  });

  it('문구는 카카오·구글·네이버 디자인 가이드가 허용하는 것만 쓴다', () => {
    // 카카오: 완성형 "카카오 로그인"(축약형 "로그인"), 구글: "Sign in with Google"의 한국어, 네이버: 완성형 "네이버 로그인"
    expect(PROVIDER_LABELS.kakao).toBe('카카오 로그인');
    expect(PROVIDER_LABELS.google).toBe('Google 계정으로 로그인');
    expect(PROVIDER_LABELS.naver).toBe('네이버 로그인');
  });

  it('버튼 색은 globals.css 토큰에 가이드 값 그대로 있다', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toContain('--kakao: #fee500;');
    expect(css).toContain('--kakao-symbol: #000000;');
    expect(css).toContain('--kakao-foreground: rgb(0 0 0 / 0.85);');
    expect(css).toContain('--google: #ffffff;');
    expect(css).toContain('--google-foreground: #1f1f1f;');
    expect(css).toContain('--google-border: #747775;');
    // 네이버 지정 컬러(변경 불가)
    expect(css).toContain('--naver: #03a94d;');
    expect(css).toContain('--naver-foreground: #ffffff;');
  });

  it('글꼴: 카카오는 기기 기본 서체, 구글은 Google Sans가 맨 앞', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/--kakao-font:\s*system-ui,/);
    expect(css).toMatch(/--font-google:\s*var\(--font-google-sans\),/);
    const source = readFileSync(
      join(process.cwd(), 'src/components/ui/provider-button.tsx'),
      'utf8',
    );
    // Google Sans Medium(500) 14/20
    expect(source).toMatch(/Google_Sans\(\{\s*weight: '500'/);
    expect(source).toContain('text-[14px] leading-5 font-medium');
  });
});
