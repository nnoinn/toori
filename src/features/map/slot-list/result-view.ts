// 홈 지도 핀·목록을 새 조건으로 다시 불러오는 동안 무엇을 보여줄지 (J4, #199). 화면 없이 테스트한다.
// 지도를 움직일 때마다 핀과 목록을 비우면 깜박이고, 목록 높이가 바뀌어 지도 크기까지 흔들린다(#199, #203).
// 그래서 새 결과가 올 때까지 이전 결과를 그대로 보여주고, 회색 카드는 처음 불러올 때만 쓴다.

/** 한 조건(key: 지도 영역·필터·고른 샵)으로 받은 결과 */
export type Shown<T> = { key: string; data: T };

/** 한 조건으로 불러오지 못했을 때 */
export type Failed = { key: string; message: string };

export type ResultView<T> = {
  /** 보여줄 결과. 새 조건의 결과가 오기 전까지는 이전 결과다. 한 번도 받지 못했으면 null */
  data: T | null;
  /** 보여줄 결과가 아직 없고 불러오는 중(회색 카드) */
  initialLoading: boolean;
  /** 이전 결과를 보여주면서 새 조건을 불러오는 중(제목 옆 작은 표시) */
  refreshing: boolean;
  /** 지금 조건을 불러오지 못한 이유. 보여줄 결과가 있으면 그 위에 안내, 없으면 오류 화면 */
  error: string | null;
  /** 보여주는 결과가 지금 조건의 것인지(이어 불러오기는 이때만 한다) */
  current: boolean;
};

export function resultView<T>(
  key: string | null,
  shown: Shown<T> | null,
  failed: Failed | null,
): ResultView<T> {
  const error = key !== null && failed?.key === key ? failed.message : null;
  const current = key !== null && shown?.key === key;
  return {
    data: shown?.data ?? null,
    initialLoading: shown === null && error === null,
    refreshing: shown !== null && !current && error === null,
    error,
    current,
  };
}

/** 이어 불러온 한 쪽(20개) */
export type ListPage<I> = { items: I[]; nextCursor: string | null; serverNow: string };

/**
 * 이어 불러온 쪽을 지금 목록 뒤에 붙인다(지도 홈 목록과 지도 없는 매물 목록이 같이 쓴다).
 * - 부를 때의 조건(requestKey)과 지금 목록의 조건이 다르면(그사이 지도를 움직이거나 필터를 바꿨으면) 붙이지 않는다.
 *   이전 영역의 목록 뒤에 새 영역 매물이 붙지 않게
 * - 이미 목록에 있는 매물은 다시 붙이지 않는다. 앞 쪽을 받은 뒤 원장님이 할인율·시간을 고치면
 *   같은 매물이 다음 쪽에 또 올 수 있어서다(같은 매물 카드가 두 번 보이지 않게)
 * - 목록에 같이 있는 다른 값(전체 매물 수 등)은 그대로 둔다
 */
export function appendPage<I extends { slotId: string }, T extends ListPage<I>>(
  prev: Shown<T> | null,
  requestKey: string | null,
  page: ListPage<I>,
): Shown<T> | null {
  if (!prev || prev.key !== requestKey) return prev;
  const seen = new Set(prev.data.items.map((item) => item.slotId));
  return {
    ...prev,
    data: {
      ...prev.data,
      items: [...prev.data.items, ...page.items.filter((item) => !seen.has(item.slotId))],
      nextCursor: page.nextCursor,
      serverNow: page.serverNow,
    },
  };
}
