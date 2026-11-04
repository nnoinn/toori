// 매장 설정 목록의 순서 바꾸기 계산. 메뉴(menu-store.ts moveMenu)와 스타일 사진(shop-images-store.ts moveStyleImage)이 같이 쓴다.
// 둘 다 [위로]·[아래로]로 한 칸씩 옮기고, 옮긴 뒤 순서를 0부터 다시 매겨 저장한다.
// 옮길 때마다 0부터 다시 매기므로, 메뉴를 숨기거나 사진을 지워서 생긴 빈 번호·겹친 번호도 그때 정리된다.

/**
 * 지금 순서(ids)에서 id를 한 칸 위(앞)·아래(뒤)로 옮긴 새 순서. 배열 위치가 곧 새 순서 번호다.
 * 목록에 없으면 'not-found', 맨 위·맨 아래라 더 못 옮기면 'edge'(바꿀 것이 없다)
 */
export function moveOneStep(
  ids: readonly string[],
  id: string,
  direction: 'up' | 'down',
): string[] | 'not-found' | 'edge' {
  const index = ids.indexOf(id);
  if (index < 0) return 'not-found';
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return 'edge';

  const ordered = [...ids];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered;
}
