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
