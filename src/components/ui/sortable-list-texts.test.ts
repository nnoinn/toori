import { describe, expect, it } from 'vitest';

import { handleLabel, reorderIds, sortableTexts } from './sortable-list-texts';

describe('reorderIds', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('아래로 끌면 그 자리에 들어가고 사이의 줄은 한 칸씩 올라간다', () => {
    expect(reorderIds(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('위로 끌면 그 자리에 들어가고 사이의 줄은 한 칸씩 내려간다', () => {
    expect(reorderIds(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('맨 끝과 맨 앞으로도 옮긴다', () => {
    expect(reorderIds(ids, 'b', 'd')).toEqual(['a', 'c', 'd', 'b']);
    expect(reorderIds(ids, 'c', 'a')).toEqual(['c', 'a', 'b', 'd']);
  });

  it('제자리에 놓거나 목록에 없는 id면 null(저장하지 않는다)', () => {
    expect(reorderIds(ids, 'b', 'b')).toBeNull();
    expect(reorderIds(ids, 'x', 'b')).toBeNull();
    expect(reorderIds(ids, 'b', 'x')).toBeNull();
  });

  it('받은 목록은 바꾸지 않는다', () => {
    const original = ['a', 'b', 'c'];
    reorderIds(original, 'a', 'c');
    expect(original).toEqual(['a', 'b', 'c']);
  });
});

describe('안내 문구', () => {
  it('손잡이 이름표와 끄는 동안 알려 줄 문구에 줄 이름과 자리를 넣는다', () => {
    expect(handleLabel('커트')).toBe('커트 순서 바꾸기');
    expect(sortableTexts.picked({ name: '커트', position: 1, total: 3 })).toBe(
      '커트, 잡았어요. 지금 3개 중 1번째예요',
    );
    expect(sortableTexts.moved({ name: '커트', position: 2, total: 3 })).toBe(
      '커트, 3개 중 2번째 자리예요',
    );
    expect(sortableTexts.dropped({ name: '커트', position: 3, total: 3 })).toBe(
      '커트, 3개 중 3번째에 놓았어요',
    );
    expect(sortableTexts.cancelled('커트')).toBe('옮기기를 그만뒀어요. 커트, 제자리예요');
  });
});
