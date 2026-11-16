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
    // 구글 Neutral(테두리 없음, 11/16 nnoinn)
    expect(css).toContain('--google: #f2f2f2;');
    expect(css).toContain('--google-foreground: #1f1f1f;');
    expect(css).not.toContain('--google-border');
    // 네이버 지정 컬러(변경 불가)
    expect(css).toContain('--naver: #03a94d;');
    expect(css).toContain('--naver-foreground: #ffffff;');
  });

  it('구글 버튼은 테두리 없는 연회색이라 버튼이 있는 화면은 모두 흰 바탕이다(11/16 nnoinn)', () => {
    const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');
    expect(read('src/components/ui/provider-button.tsx')).not.toMatch(/border-google/);
    // 폰: 첫 화면·로그인 화면은 로그인 폼 자체가 흰 바탕, PC: 가운데 흰 카드
    expect(read('src/app/(customer)/(focus)/login/login-form.tsx')).toContain('max-md:bg-card');
    expect(read('src/app/(customer)/(focus)/layout.tsx')).toContain('md:bg-card');
    // 운영자 입구: 폰·PC 모두 흰 카드
    expect(read('src/app/admin/login/page.tsx')).toContain('rounded-xl bg-card');
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
