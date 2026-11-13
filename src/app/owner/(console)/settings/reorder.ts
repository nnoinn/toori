// 매장 설정 목록의 순서 바꾸기 확인. 메뉴(menu-store.ts saveMenuOrder)와 스타일 사진(shop-images-store.ts saveStyleImageOrder)이 같이 쓴다.
// 화면에서 손잡이를 끌어 놓으면 놓은 뒤의 전체 순서(id 목록)가 온다(#358 2번, 공통 UI SortableList).
// 서버는 그 목록이 지금 목록과 같은 것들인지 확인한 뒤 순서를 0부터 다시 매겨 저장한다.
// 매번 0부터 다시 매기므로, 메뉴를 숨기거나 사진을 지워서 생긴 빈 번호·겹친 번호도 그때 정리된다.

/** 서버 함수가 받은 값이 id 목록 모양인지(화면이 아닌 곳에서 이상한 값을 보낼 수 있다) */
export function isIdList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((id) => typeof id === 'string');
}

/**
 * 끌어 놓은 뒤의 순서(ordered)가 지금 목록(current)과 같은 것들을 순서만 바꾼 것이면 그 순서를 돌려준다. 배열 위치가 곧 새 순서 번호다.
 * 하나라도 빠지거나, 목록에 없는 것이 섞이거나, 같은 것이 두 번 있으면 'changed'(저장하지 않는다).
 * 예: 다른 창에서 메뉴를 더하거나 숨겨서 목록이 바뀜, 다른 샵 메뉴·숨긴 메뉴·대표 사진이 섞임
 */
export function checkReorder(
  current: readonly string[],
  ordered: readonly string[],
): string[] | 'changed' {
  if (ordered.length !== current.length) return 'changed';
  const left = new Set(current);
  for (const id of ordered) {
    // 목록에 없거나 이미 한 번 나온 id면 지울 것이 없다
    if (!left.delete(id)) return 'changed';
  }
  return [...ordered];
}
