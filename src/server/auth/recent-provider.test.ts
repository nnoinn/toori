// 최근 로그인 방식 값 읽기 (11/16 nnoinn, AUTH-15). 쿠키에 적고 지우는 것은 로그인 콜백 테스트(route.test.ts)가 본다.

import { describe, expect, it } from 'vitest';

import { PROVIDER_ORDER } from '@/components/ui/provider-labels';

import { parseRecentProvider } from './recent-provider';

describe('parseRecentProvider', () => {
  it.each(PROVIDER_ORDER)('버튼에 있는 방식(%s)은 그대로 읽는다', (provider) => {
    expect(parseRecentProvider(provider)).toBe(provider);
  });

  it.each(['toss', 'KAKAO', 'custom:naver', '', null, undefined])(
    '버튼에 없는 값(%j)은 표시하지 않는다',
    (value) => {
      expect(parseRecentProvider(value)).toBeNull();
    },
  );
});
