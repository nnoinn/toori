// 공통 뒤로가기(BackButton)가 브라우저 뒤로 가기를 써도 되는지(#533, 11/22 정찬형).
// 예전에는 "방문 기록이 1개보다 많으면" 뒤로 갔는데, 새 탭이나 다른 사이트에서 주소로 바로 들어와도 기록이 2개 이상이라
// 투리 밖(빈 화면, 이전 사이트)으로 나갔다. Navigation API가 있으면 같은 출처(투리)의 바로 앞 기록이 있을 때만 뒤로 간다.
// Navigation API가 없는 브라우저(예전 사파리 등)는 예전 방식으로 본다

export type HistorySnapshot = {
  /** Navigation API의 지금 기록 순번(navigation.currentEntry.index, 같은 출처의 이어진 기록만 센다). API가 없으면 null */
  navigationIndex: number | null;
  /** window.history.length */
  historyLength: number;
};

/** 투리 안의 이전 화면이 있으면 true(뒤로 가기), 없으면 false(정해 둔 화면으로) */
export function canGoBackInApp({ navigationIndex, historyLength }: HistorySnapshot): boolean {
  if (navigationIndex !== null) return navigationIndex > 0;
  return historyLength > 1;
}
