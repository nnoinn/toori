// 매물 목록 한 줄 (J4). 서버 조회가 이 모양으로 화면에 넘긴다.
// 금액·배지·거리는 서버가 정해서 넘기고, 화면은 계산하지 않는다(공통 UI SlotCard 규칙).
// 목록에는 지금 매물(slot)과 시간대 매물(window, #308)이 섞여 있다.

import type { SlotBadgeKind } from '@/components/ui/slot-badge';

export type SlotListItem = {
  kind: 'slot';
  slotId: string;
  shopId: string;
  shopName: string;
  menuName: string;
  /** 서비스 시작 시각(ISO) */
  startAt: string;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  imageUrl: string | null;
  /** 지금 위치(또는 고른 동네 중심)에서의 거리(m). 모르면 null */
  distanceMeters: number | null;
  /** 서버가 정책값으로 정한 배지. 홀딩은 참/거짓만 받아 onHold로 바꾼다(#57 답) */
  badges: SlotBadgeKind[];
};

/** 시간대 매물 카드 한 줄(#308). 누르면 시간대 상세(/windows/[windowId])에서 서비스와 시작 시각을 고른다 */
export type WindowListItem = {
  kind: 'window';
  windowId: string;
  shopId: string;
  shopName: string;
  /** 지금 고를 수 있는 첫 서비스 이름과 서비스 수("여성 커트 외 3개") */
  firstMenuName: string;
  menuCount: number;
  /** 시간대 시작·끝(ISO) */
  startAt: string;
  endAt: string;
  /** 서비스 중 가장 큰 할인율과 가장 낮은 할인가("최대 30% 17,500원부터") */
  maxDiscountRate: number;
  minSalePrice: number;
  imageUrl: string | null;
  distanceMeters: number | null;
  /** 가장 빠른 시작이 임박이면 imminent, 신규 고객 전용이면 newCustomerOnly(badges.ts windowBadges) */
  badges: SlotBadgeKind[];
};

export type ListItem = SlotListItem | WindowListItem;

/** 목록 안에서 한 줄을 가리키는 값(React key, 이어 불러올 때 겹침 확인) */
export function listItemKey(item: ListItem): string {
  return item.kind === 'slot' ? `slot:${item.slotId}` : `window:${item.windowId}`;
}

export type SlotListPage = {
  items: ListItem[];
  /** 다음 20개를 가져올 커서. 더 없으면 null */
  nextCursor: string | null;
};
