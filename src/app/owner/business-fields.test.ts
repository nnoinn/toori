import { describe, expect, it } from 'vitest';

import { validateBusinessInput, validatePayoutInput } from './business-fields';

const TODAY = '2026-10-30';
const business = {
  businessName: ' 투리 테스트 헤어 ',
  representativeName: '테스트 원장',
  // 검증번호가 맞는 가짜 번호(만드는 법은 src/lib/business-number.test.ts)
  businessRegistrationNumber: '123-45-67891',
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
        businessRegistrationNumber: '1234567891',
      },
    });
  });

  it('사업자등록번호: 10자리가 아니면 자릿수 안내, 검증번호가 틀리면 다시 확인 안내(#205)', () => {
    const short = validateBusinessInput(
      { ...business, businessRegistrationNumber: '123-45-6789' },
      TODAY,
    );
    expect(short.ok === false && short.fieldErrors.businessRegistrationNumber).toBe(
      '사업자등록번호 10자리를 입력해 주세요(예: 123-45-67890)',
    );
    const wrong = validateBusinessInput(
      { ...business, businessRegistrationNumber: '123-45-67890' },
      TODAY,
    );
    expect(wrong.ok === false && wrong.fieldErrors.businessRegistrationNumber).toBe(
      '사업자등록번호를 다시 확인해 주세요',
    );
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
    // 빈 칸 문구의 조사는 받침에 맞춘다("예금주을(를)"이 아니라)
    expect(result.ok === false && result.fieldErrors.accountHolder).toBe('예금주를 입력해 주세요');
  });

  it('빈 상호·대표자명 문구도 받침에 맞춘 조사', () => {
    const result = validateBusinessInput(
      { ...business, businessName: ' ', representativeName: '' },
      TODAY,
    );
    expect(result.ok === false && result.fieldErrors).toMatchObject({
      businessName: '상호를 입력해 주세요',
      representativeName: '대표자명을 입력해 주세요',
    });
  });
});
