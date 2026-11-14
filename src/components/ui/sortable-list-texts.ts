// 끌어서 순서 바꾸기(SortableList)의 순서 계산과 화면 읽기 프로그램 안내 문구(11/13 nnoinn, #358). 화면 없이 테스트한다.

/** 끌어 놓은 뒤의 새 순서. 제자리이거나 목록에 없는 id면 null(저장할 것이 없다) */
export function reorderIds(
  ids: readonly string[],
  activeId: string,
  overId: string,
): string[] | null {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 손잡이 이름표. 예: "커트 순서 바꾸기" */
export function handleLabel(name: string): string {
  return `${name} 순서 바꾸기`;
}

/** 손잡이의 역할 이름(화면 읽기 프로그램이 "버튼" 대신 읽는다) */
export const SORTABLE_ROLE_DESCRIPTION = '끌어서 순서 바꾸기';

/** 키보드 사용법. 손잡이에 처음 갔을 때 화면 읽기 프로그램이 읽는다 */
export const SORTABLE_INSTRUCTIONS =
  '순서를 바꾸려면 스페이스나 엔터를 누른 뒤 위·아래 화살표로 옮기고, 다시 스페이스나 엔터로 놓아요. Esc를 누르면 그만둬요';

/** 여러 칸(layout="grid", 예: 사진)일 때 키보드 사용법. 위·아래뿐 아니라 왼쪽·오른쪽으로도 옮긴다 */
export const SORTABLE_GRID_INSTRUCTIONS =
  '순서를 바꾸려면 스페이스나 엔터를 누른 뒤 화살표로 옮기고, 다시 스페이스나 엔터로 놓아요. Esc를 누르면 그만둬요';

/** 줄 이름과 자리(1부터). total은 전체 줄 수 */
type Place = { name: string; position: number; total: number };

/** 끄는 동안 화면 읽기 프로그램에 알려 줄 문구 */
export const sortableTexts = {
  picked: ({ name, position, total }: Place) =>
    `${name}, 잡았어요. 지금 ${total}개 중 ${position}번째예요`,
  moved: ({ name, position, total }: Place) => `${name}, ${total}개 중 ${position}번째 자리예요`,
  dropped: ({ name, position, total }: Place) =>
    `${name}, ${total}개 중 ${position}번째에 놓았어요`,
  cancelled: (name: string) => `옮기기를 그만뒀어요. ${name}, 제자리예요`,
};
