import { describe, expect, it } from 'vitest';

import { checkReorder, isIdList } from './reorder';

describe('checkReorder (메뉴·스타일 사진 끌어서 순서 바꾸기, #358)', () => {
  const current = ['a', 'b', 'c'];

  it('같은 것들의 순서만 바꾸면 끌어 놓은 순서 그대로 저장한다', () => {
    expect(checkReorder(current, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
    expect(checkReorder(current, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(checkReorder([], [])).toEqual([]);
  });

  it('하나라도 빠지면 changed(다른 창에서 메뉴를 더해서 목록이 바뀐 경우)', () => {
    expect(checkReorder(current, ['b', 'a'])).toBe('changed');
    expect(checkReorder(current, [])).toBe('changed');
  });

  it('목록에 없는 것이 섞이면 changed(다른 샵 메뉴·숨긴 메뉴·대표 사진)', () => {
    expect(checkReorder(current, ['a', 'b', 'x'])).toBe('changed');
    expect(checkReorder(current, ['a', 'b', 'c', 'x'])).toBe('changed');
  });

  it('같은 것이 두 번 있으면 개수가 같아도 changed', () => {
    expect(checkReorder(current, ['a', 'a', 'c'])).toBe('changed');
  });

  it('받은 배열은 바꾸지 않고 새 배열을 돌려준다', () => {
    const ordered = ['b', 'a', 'c'];
    const saved = checkReorder(current, ordered);
    expect(saved).not.toBe(ordered);
    expect(current).toEqual(['a', 'b', 'c']);
  });
});

describe('isIdList', () => {
  it('문자열 배열만 id 목록으로 받는다', () => {
    expect(isIdList(['a', 'b'])).toBe(true);
    expect(isIdList([])).toBe(true);
    expect(isIdList('a')).toBe(false);
    expect(isIdList(['a', 1])).toBe(false);
    expect(isIdList(null)).toBe(false);
  });
});
