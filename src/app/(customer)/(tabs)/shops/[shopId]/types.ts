// 샵 프로필 화면에 넘기는 값 (C-309). 서버 조회(queries.ts)가 이 모양으로 만든다.

import type { SlotDetail } from '../../slots/[slotId]/types';

/** 샵 프로필의 메뉴 한 줄: 원장님이 숨기지 않은 메뉴의 이름과 정가 */
export type ShopMenuItem = { menuId: string; name: string; listPrice: number };

/**
 * 판매자 정보: 원장님이 입점 때 낸 사업자 정보(S-101). 사업장 주소는 따로 받지 않아서 샵 주소를 쓴다(11/26 정찬형).
 * 사업자등록번호는 저장된 그대로(숫자 10자리)이고 화면에서 123-45-67890 모양으로 바꾼다(shop-format.ts)
 */
export type SellerInfo = {
  businessName: string;
  representativeName: string;
  businessRegistrationNumber: string;
  roadAddress: string;
  addressDetail: string | null;
  phone: string;
};

export type ShopProfile = {
  /** 매물 상세와 같은 샵 정보(이름·주소·좌표·전화·영업시간·소개·외부 링크) */
  shop: SlotDetail['shop'];
  /** 업종 이름. 예: "미용실" */
  category: string;
  /** 샵의 시·군·구 코드(지금 매물을 찾을 때 쓴다) */
  sigunguCode: string;
  /** 대표 사진 먼저, 그다음 시술(스타일) 사진(공개 주소) */
  imageUrls: string[];
  menus: ShopMenuItem[];
  seller: SellerInfo;
};
