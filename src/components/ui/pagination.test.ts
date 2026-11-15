// 쪽 번호에 보여줄 번호(처음·끝 쪽과 지금 쪽 앞뒤 2쪽, 건너뛴 자리는 …).

import { describe, expect, it } from 'vitest';

import { pageItems } from './pagination';

describe('쪽 번호', () => {
  it('쪽이 적으면 모두 보여준다', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('가운데 쪽이면 처음·끝 사이를 …으로 줄인다', () => {
    expect(pageItems(6, 20)).toEqual([1, 'gap', 4, 5, 6, 7, 8, 'gap', 20]);
  });

  it('처음이나 끝 가까이면 한쪽만 줄인다', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 'gap', 20]);
    expect(pageItems(20, 20)).toEqual([1, 'gap', 18, 19, 20]);
    // 하나만 건너뛰어도 …으로 쓴다
    expect(pageItems(5, 9)).toEqual([1, 'gap', 3, 4, 5, 6, 7, 'gap', 9]);
  });
});
