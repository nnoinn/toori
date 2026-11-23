import { describe, expect, it } from 'vitest';

import { canGoBackInApp } from './back-button-rules';

// 공통 뒤로가기가 브라우저 뒤로 가기를 써도 되는지(#533, 11/22 정찬형).
// 새 탭이나 다른 사이트에서 주소로 바로 들어오면 방문 기록이 2개 이상이어도 투리 안의 이전 화면은 없다
describe('뒤로가기: 투리 안의 이전 화면이 있을 때만 뒤로', () => {
  it('Navigation API: 같은 출처(투리)의 바로 앞 기록이 있으면 뒤로', () => {
    expect(canGoBackInApp({ navigationIndex: 1, historyLength: 2 })).toBe(true);
    expect(canGoBackInApp({ navigationIndex: 3, historyLength: 4 })).toBe(true);
  });

  it('Navigation API: 투리의 첫 기록이면 방문 기록이 여러 개여도 정해 둔 화면으로(새 탭·다른 사이트에서 옴)', () => {
    expect(canGoBackInApp({ navigationIndex: 0, historyLength: 2 })).toBe(false);
    expect(canGoBackInApp({ navigationIndex: 0, historyLength: 5 })).toBe(false);
  });

  it('지금 기록이 목록에 없으면(-1) 정해 둔 화면으로', () => {
    expect(canGoBackInApp({ navigationIndex: -1, historyLength: 3 })).toBe(false);
  });

  it('Navigation API가 없는 브라우저는 예전처럼 방문 기록 수로', () => {
    expect(canGoBackInApp({ navigationIndex: null, historyLength: 2 })).toBe(true);
    expect(canGoBackInApp({ navigationIndex: null, historyLength: 1 })).toBe(false);
  });
});
