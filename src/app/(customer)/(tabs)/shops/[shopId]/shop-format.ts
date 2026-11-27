// 샵 프로필(C-309)의 주소와 판매자 정보 줄. 화면 코드에서 계산하지 않게 여기서 만든다.

import { formatBusinessNumber } from '@/lib/business-number';

import type { SellerInfo } from './types';

/** 샵 프로필 주소. 예: /shops/1b2c... */
export function shopProfilePath(shopId: string): string {
  return `/shops/${shopId}`;
}

/**
 * 판매자 정보 다섯 줄(이용약관 초안이 약속한 것, C-309): 상호·대표자·사업자등록번호·사업장 주소·연락처.
 * 사업장 주소는 샵 주소(상세 주소가 있으면 붙인다)다
 */
export function sellerInfoRows(seller: SellerInfo): { label: string; value: string }[] {
  return [
    { label: '상호', value: seller.businessName },
    { label: '대표자', value: seller.representativeName },
    { label: '사업자등록번호', value: formatBusinessNumber(seller.businessRegistrationNumber) },
    {
      label: '사업장 주소',
      value: seller.addressDetail
        ? `${seller.roadAddress} ${seller.addressDetail}`
        : seller.roadAddress,
    },
    { label: '연락처', value: seller.phone },
  ];
}
