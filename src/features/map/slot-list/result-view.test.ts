import { describe, expect, it } from 'vitest';

import { resultView } from './result-view';

const A = 'area-a';
const B = 'area-b';

describe('홈 핀·목록을 다시 불러오는 동안 보여줄 것 (#199)', () => {
  it('처음 불러올 때만 회색 카드', () => {
    expect(resultView(A, null, null)).toEqual({
      data: null,
      initialLoading: true,
      refreshing: false,
      error: null,
      current: false,
    });
    // 지도가 준비되기 전(조건 없음)도 처음 불러오는 중이다
    expect(resultView(null, null, null).initialLoading).toBe(true);
  });

  it('받은 결과가 지금 조건의 것이면 그대로 보여준다', () => {
    expect(resultView(A, { key: A, data: [1, 2] }, null)).toEqual({
      data: [1, 2],
      initialLoading: false,
      refreshing: false,
      error: null,
      current: true,
    });
  });

  it('지도를 옮겨 조건이 바뀌면 새 결과가 올 때까지 이전 결과를 두고 작은 표시만', () => {
    const view = resultView(B, { key: A, data: [1, 2] }, null);
    expect(view.data).toEqual([1, 2]);
    expect(view.initialLoading).toBe(false);
    expect(view.refreshing).toBe(true);
    // 이전 결과로는 이어 불러오지 않는다(새 영역과 다른 목록이라서)
    expect(view.current).toBe(false);
  });

  it('새 조건을 불러오지 못하면 이전 결과는 두고 실패를 알린다', () => {
    const view = resultView(B, { key: A, data: [1, 2] }, { key: B, message: '실패' });
    expect(view.data).toEqual([1, 2]);
    expect(view.refreshing).toBe(false);
    expect(view.error).toBe('실패');
  });

  it('처음부터 불러오지 못하면 보여줄 것 없이 실패', () => {
    const view = resultView(A, null, { key: A, message: '실패' });
    expect(view.data).toBeNull();
    expect(view.initialLoading).toBe(false);
    expect(view.error).toBe('실패');
  });

  it('지난 조건의 실패는 지금 조건에 쓰지 않는다', () => {
    const view = resultView(B, { key: A, data: [1] }, { key: A, message: '지난 실패' });
    expect(view.error).toBeNull();
    expect(view.refreshing).toBe(true);
  });
});
