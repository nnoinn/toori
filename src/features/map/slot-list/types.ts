// 매물 목록 한 줄 (J4). 서버 조회가 이 모양으로 화면에 넘긴다.
// 금액·배지·거리는 서버가 정해서 넘기고, 화면은 계산하지 않는다(공통 UI SlotCard 규칙).

import type { SlotBadgeKind } from '@/components/ui/slot-badge';

export type SlotListItem = {
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

export type SlotListPage = {
  items: SlotListItem[];
  /** 다음 20개를 가져올 커서. 더 없으면 null */
  nextCursor: string | null;
};
