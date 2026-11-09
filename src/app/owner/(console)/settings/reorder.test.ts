import { describe, expect, it } from 'vitest';

import { moveOneStep } from './reorder';

describe('moveOneStep (메뉴·스타일 사진 순서 바꾸기)', () => {
  const ids = ['a', 'b', 'c'];

  it('위로 옮기면 바로 앞과 자리를 바꾼다', () => {
    expect(moveOneStep(ids, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moveOneStep(ids, 'c', 'up')).toEqual(['a', 'c', 'b']);
  });

  it('아래로 옮기면 바로 뒤와 자리를 바꾼다', () => {
    expect(moveOneStep(ids, 'a', 'down')).toEqual(['b', 'a', 'c']);
    expect(moveOneStep(ids, 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('맨 위를 위로, 맨 아래를 아래로 옮기면 edge', () => {
    expect(moveOneStep(ids, 'a', 'up')).toBe('edge');
    expect(moveOneStep(ids, 'c', 'down')).toBe('edge');
    expect(moveOneStep(['a'], 'a', 'down')).toBe('edge');
  });

  it('목록에 없는 id면 not-found', () => {
    expect(moveOneStep(ids, 'x', 'up')).toBe('not-found');
    expect(moveOneStep([], 'a', 'down')).toBe('not-found');
  });

  it('받은 배열은 바꾸지 않는다', () => {
    const original = ['a', 'b'];
    moveOneStep(original, 'b', 'up');
    expect(original).toEqual(['a', 'b']);
  });
});
