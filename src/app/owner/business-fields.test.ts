import { describe, expect, it } from 'vitest';

import { kstDateKey, validateBusinessInput, validatePayoutInput } from './business-fields';

const TODAY = '2026-10-30';
const business = {
  businessName: ' 투리 테스트 헤어 ',
  representativeName: '테스트 원장',
  businessRegistrationNumber: '000-00-00000',
  openedOn: '2025-01-01',
  businessDocPath: 'shops/shop-1/doc.jpg',
};

describe('사업자 정보 검사 (S-101, D3)', () => {
  it('앞뒤 빈칸을 빼고 사업자등록번호는 숫자 10자리로', () => {
    expect(validateBusinessInput(business, TODAY)).toEqual({
      ok: true,
      data: {
        ...business,
        businessName: '투리 테스트 헤어',
        businessRegistrationNumber: '0000000000',
      },
    });
  });

  it('개업일자가 오늘 뒤면, 등록증이 없으면 막는다', () => {
    const result = validateBusinessInput(
      { ...business, openedOn: '2026-10-31', businessDocPath: '' },
      TODAY,
    );
    expect(result.ok === false && Object.keys(result.fieldErrors).sort()).toEqual([
      'businessDocPath',
      'openedOn',
    ]);
  });
});

describe('정산 계좌 검사 (S-107)', () => {
  it('하이픈을 뺀 숫자 계좌번호로', () => {
    expect(
      validatePayoutInput({
        bankCode: '004',
        accountNumber: '123-456-78901',
        accountHolder: ' 홍 ',
      }),
    ).toEqual({
      ok: true,
      data: { bankCode: '004', accountNumber: '12345678901', accountHolder: '홍' },
    });
  });

  it('은행·계좌번호·예금주가 틀리면 칸별 문구', () => {
    const result = validatePayoutInput({ bankCode: '', accountNumber: '1234', accountHolder: '' });
    expect(result.ok === false && Object.keys(result.fieldErrors).sort()).toEqual([
      'accountHolder',
      'accountNumber',
      'bankCode',
    ]);
  });
});

describe('kstDateKey', () => {
  it('한국 날짜로 바꾼다(UTC 15시 = 한국 다음 날 0시)', () => {
    expect(kstDateKey(new Date('2026-10-30T14:59:00Z'))).toBe('2026-10-30');
    expect(kstDateKey(new Date('2026-10-30T15:00:00Z'))).toBe('2026-10-31');
  });
});
