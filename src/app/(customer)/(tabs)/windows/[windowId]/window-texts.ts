// 시간대 상세(#308)의 서비스·시작 시각 고르기 함수. 화면과 서버 어디서나 쓴다.
// 시간대 범위 글자는 목록 카드와 같이 쓰려고 @/features/map/slot-list/window-range에 둔다.

import type { SlotWindowMenu, WindowStart } from '@/server/slot-windows';

/** 처음 열 때 골라 둘 서비스: 지금 시작할 수 있는 시각이 있는 첫 서비스. 없으면 null */
export function firstOpenMenuId(menus: SlotWindowMenu[]): string | null {
  return menus.find((menu) => menu.starts.length > 0)?.menuId ?? null;
}

/**
 * 고른 서비스·시작 시각이 지금도 있는지 보고 남은 것만 돌려준다.
 * [예약하기]가 실패해 화면을 다시 불러오면 그 시각이 사라질 수 있어서, 고른 값을 그대로 믿지 않는다
 */
export function resolvePick(
  menus: SlotWindowMenu[],
  pick: { menuId: string | null; startAt: string | null },
): { menu: SlotWindowMenu | null; start: WindowStart | null } {
  const menu = menus.find((item) => item.menuId === pick.menuId) ?? null;
  const start = menu?.starts.find((item) => item.startAt === pick.startAt) ?? null;
  return { menu, start };
}

/** [예약하기] 자리의 문구. 다 고르기 전에는 무엇을 골라야 하는지 알려 주고 누를 수 없다 */
export function reserveHint(menu: SlotWindowMenu | null, start: WindowStart | null): string | null {
  if (!menu) return '서비스를 골라 주세요';
  if (menu.starts.length === 0) return '이 서비스는 지금 고를 수 있는 시각이 없어요';
  if (!start) return '시작 시각을 골라 주세요';
  return null;
}
