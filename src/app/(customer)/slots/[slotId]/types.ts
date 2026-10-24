// 매물 상세 화면에 넘기는 값 (J7). 서버 조회가 이 모양으로 만든다.
// 상태·배지·금액은 서버가 정해서 넘기고 화면은 계산하지 않는다.

import type { SlotBadgeKind } from '@/components/ui/slot-badge';

/**
 * 고객이 지금 예약할 수 있는지.
 * - available: 게시중이고 홀딩 없음
 * - onHold: 다른 고객이 결제 중(C-404)
 * - mine: 내가 홀딩 중(#57 답: 본인용 표시)
 * - closed: 예약됨·마감·취소·완료 등 더는 예약할 수 없음
 */
export type SlotAvailability = 'available' | 'onHold' | 'mine' | 'closed';

export type SlotDetail = {
  slotId: string;
  availability: SlotAvailability;
  badges: SlotBadgeKind[];
  /** 서비스 시작 시각(ISO) */
  startAt: string;
  listPrice: number;
  salePrice: number;
  discountRate: number;
  menu: {
    name: string;
    description: string | null;
    durationMinutes: number;
  };
  shop: {
    shopId: string;
    name: string;
    roadAddress: string;
    addressDetail: string | null;
    phone: string;
    lat: number;
    lng: number;
    /** shops.business_hours 그대로(화면에서 detail-format으로 정리) */
    businessHours: unknown;
    description: string | null;
    instagramUrl: string | null;
    naverPlaceUrl: string | null;
  };
  /** 대표 이미지가 먼저, 그다음 스타일 이미지(공개 주소) */
  imageUrls: string[];
};
