import { describe, expect, it } from 'vitest';

import { sellerInfoRows, shopProfilePath } from './shop-format';
import type { SellerInfo } from './types';

// 샵 프로필의 주소와 판매자 정보 줄 (C-309)

const SELLER: SellerInfo = {
  businessName: '샘플 헤어',
  representativeName: '홍길동',
  businessRegistrationNumber: '1234567890',
  roadAddress: '경기 안산시 상록구 테스트로 1',
  addressDetail: '2층',
  phone: '031-000-0000',
};

describe('샵 프로필 주소', () => {
  it('/shops/샵 id', () => {
    expect(shopProfilePath('abc')).toBe('/shops/abc');
  });
});

describe('판매자 정보', () => {
  it('상호·대표자·사업자등록번호·사업장 주소·연락처 다섯 줄, 이 순서', () => {
    expect(sellerInfoRows(SELLER)).toEqual([
      { label: '상호', value: '샘플 헤어' },
      { label: '대표자', value: '홍길동' },
      { label: '사업자등록번호', value: '123-45-67890' },
      { label: '사업장 주소', value: '경기 안산시 상록구 테스트로 1 2층' },
      { label: '연락처', value: '031-000-0000' },
    ]);
  });

  it('상세 주소가 없으면 도로명 주소만', () => {
    const rows = sellerInfoRows({ ...SELLER, addressDetail: null });
    expect(rows.find((row) => row.label === '사업장 주소')?.value).toBe(
      '경기 안산시 상록구 테스트로 1',
    );
  });
});
