// 시간대 매물 함수가 주고받는 값 (S-201 두 번째 방식, #308). 시각은 ISO 문자열이다. 화면과 서버 어디서나 가져올 수 있다.

import type { ServiceType, ShopCategory } from '@/server/policy';

// ── 원장님(정민석) ──

/** 켜진 칸이 이어진 묶음 하나 */
export type WindowRangeInput = { startAt: string; endAt: string };

/** 올릴 서비스 하나와 할인율(10/20/30/40/50) */
export type WindowMenuInput = { menuId: string; discountRate: number };

/** createSlotWindows 입력 */
export type CreateSlotWindowsInput = {
  ranges: WindowRangeInput[];
  menus: WindowMenuInput[];
  newCustomerOnly: boolean;
};

/** 저장한 시간대 하나(묶음마다 하나) */
export type CreatedSlotWindow = {
  windowId: string;
  startAt: string;
  endAt: string;
  /** 게시 시각. 시간대 시작 48시간 전보다 이르면 그때까지 예약대기 */
  publishAt: string;
  status: 'scheduled' | 'published';
};

/** 마감할 때 손님이 결제 중이라 남긴 칸(#308 ③-2). 결제하면 예약으로 남고, 결제 없이 끝나면 자동으로 닫힌다 */
export type KeptWindowSlot = {
  slotId: string;
  startAt: string;
  endAt: string;
  menuName: string;
  /** 홀딩이 끝나는 시각(서버 시각 기준). 이미 지났으면 결제 확인을 기다리는 칸이다 */
  holdExpiresAt: string;
};

/** closeSlotWindow 결과 */
export type ClosedSlotWindow = {
  closedAt: string;
  /** 손님이 결제 중이라 남긴 칸(홀딩이 살아 있거나 결제 확인을 기다리는 칸). 없으면 [] */
  keptSlots: KeptWindowSlot[];
};

/** getLastWindowSettings 결과. 그 샵이 마지막으로 올린 시간대의 서비스·할인율(지금 숨긴 메뉴는 뺀다) */
export type LastWindowSettings = {
  menus: WindowMenuInput[];
  newCustomerOnly: boolean;
};

/**
 * 시간대 상태(windowStatus). scheduled: 게시 전(예약대기), published: 게시중이고 남은 시간에 들어가는 서비스가 있음,
 * full: 게시중이지만 남은 시간에 들어가는 서비스가 없음(목록에서 내린다), closed: 원장님이 마감했거나 시간이 지남
 */
export type WindowState = 'scheduled' | 'published' | 'full' | 'closed';

// ── 고객(정찬형) ──

/** 지금 시작할 수 있는 시각 하나. 끝나는 시각은 서비스 소요 시간으로 계산해서 같이 준다 */
export type WindowStart = { startAt: string; endAt: string };

/** listSlotWindows의 시간대 카드 하나(지금 매물 목록과 섞어 정렬한다) */
export type SlotWindowCard = {
  windowId: string;
  shopId: string;
  shopName: string;
  category: ShopCategory;
  lat: number;
  lng: number;
  /** 카드 사진(지금 매물 카드와 같은 기준: 대표 이미지). 없으면 null */
  imageUrl: string | null;
  startAt: string;
  endAt: string;
  /** 지금 남은 시간에 들어가는 서비스 수 */
  menuCount: number;
  /** 카드에 보여줄 첫 서비스 이름("커트 외 3개") */
  firstMenuName: string;
  /** 서비스 중 가장 큰 할인율(할인율순 정렬) */
  maxDiscountRate: number;
  /** 서비스 중 가장 낮은 할인가 */
  minSalePrice: number;
  newCustomerOnly: boolean;
  /** 지금 시작할 수 있는 가장 빠른 시각(임박순 정렬, 임박 강조) */
  earliestStartAt: string;
};

/** 시간대 상세의 샵. 지금 매물 상세(SlotDetail)의 shop과 같은 모양이다(원장님 프로필 칸을 그대로 쓴다) */
export type SlotWindowShop = {
  shopId: string;
  name: string;
  roadAddress: string;
  addressDetail: string | null;
  phone: string;
  lat: number;
  lng: number;
  /** shops.business_hours 그대로 */
  businessHours: unknown;
  description: string | null;
  instagramUrl: string | null;
  naverPlaceUrl: string | null;
};

/** 시간대 상세의 서비스 하나 */
export type SlotWindowMenu = {
  menuId: string;
  serviceType: ServiceType;
  name: string;
  description: string | null;
  durationMinutes: number;
  listPrice: number;
  discountRate: number;
  salePrice: number;
  /** 지금 시작할 수 있는 시각(30분 단위, 끝이 시간대를 넘지 않고 이미 예약·결제 중인 시간과 겹치지 않음). 없으면 빈 목록 */
  starts: WindowStart[];
};

/** getSlotWindow 결과. 볼 수 없는 시간대면 null(404) */
export type SlotWindowDetail = {
  windowId: string;
  shop: SlotWindowShop;
  /** 대표 이미지가 먼저, 그다음 스타일 이미지(지금 매물 상세와 같다) */
  imageUrls: string[];
  startAt: string;
  endAt: string;
  newCustomerOnly: boolean;
  menus: SlotWindowMenu[];
  serverNow: string;
};

/** holdWindowSlot 입력 */
export type HoldWindowSlotInput = { windowId: string; menuId: string; startAt: string };
