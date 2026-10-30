import { describe, expect, it } from 'vitest';

import { EMPTY_OWNER_JOIN_FORM, type OwnerJoinForm, validateOwnerJoin } from './owner-join';

const TODAY = '2026-10-29';

/** 모든 칸을 올바르게 채운 입력. 테스트마다 한 칸씩 바꿔 본다 */
const filled: OwnerJoinForm = {
  ownerName: ' 테스트 원장 ',
  ownerPhone: '01012345678',
  businessName: '테스트 미용실',
  representativeName: '테스트 원장',
  businessRegistrationNumber: '123-45-67890',
  openedOn: '2026-01-01',
  businessDocPath: 'users/user-1/doc.jpg',
  shopName: '테스트 미용실 안산점',
  category: 'hair',
  shopPhone: '0311234567',
  roadAddress: '경기 안산시 단원구 화랑로 387',
  addressDetail: '',
  bankCode: '004',
  accountNumber: '123-456-78901',
  accountHolder: '테스트 원장',
  agreements: { supplier: true, privacy: true, payoutInfo: true },
};

const errorsOf = (form: Partial<OwnerJoinForm>) => {
  const result = validateOwnerJoin({ ...filled, ...form }, TODAY);
  return result.ok ? {} : result.fieldErrors;
};

describe('원장님 가입 입력 검사 (S-101·S-107)', () => {
  it('올바른 입력을 createOwnerAccount 입력 모양으로 바꾼다', () => {
    expect(validateOwnerJoin(filled, TODAY)).toEqual({
      ok: true,
      data: {
        owner: { name: '테스트 원장', phone: '010-1234-5678' },
        shop: {
          businessName: '테스트 미용실',
          representativeName: '테스트 원장',
          businessRegistrationNumber: '1234567890',
          openedOn: '2026-01-01',
          businessDocPath: 'users/user-1/doc.jpg',
          name: '테스트 미용실 안산점',
          category: 'hair',
          phone: '031-123-4567',
          roadAddress: '경기 안산시 단원구 화랑로 387',
        },
        payout: { bankCode: '004', accountNumber: '12345678901', accountHolder: '테스트 원장' },
        agreements: { supplier: true, privacy: true, payoutInfo: true },
      },
    });
  });

  it('상세 주소는 적으면 넘기고, 비우면 넘기지 않는다', () => {
    const result = validateOwnerJoin({ ...filled, addressDetail: ' 2층 ' }, TODAY);
    expect(result.ok && result.data.shop.addressDetail).toBe('2층');
  });

  it('빈 입력은 모든 필수 칸에 문구가 붙는다', () => {
    const result = validateOwnerJoin(EMPTY_OWNER_JOIN_FORM, TODAY);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.ok ? {} : result.fieldErrors).sort()).toEqual(
      [
        'accountHolder',
        'accountNumber',
        'agreements',
        'bankCode',
        'businessDocPath',
        'businessName',
        'businessRegistrationNumber',
        'category',
        'openedOn',
        'ownerName',
        'ownerPhone',
        'representativeName',
        'roadAddress',
        'shopName',
        'shopPhone',
      ].sort(),
    );
  });

  it.each(['12345678', '123-45-678901', '123-45-6789a'])(
    '사업자등록번호 %s는 10자리 숫자가 아니라 막는다',
    (value) => {
      expect(errorsOf({ businessRegistrationNumber: value })).toHaveProperty(
        'businessRegistrationNumber',
      );
    },
  );

  it('개업일자는 오늘까지만 된다', () => {
    expect(errorsOf({ openedOn: TODAY })).not.toHaveProperty('openedOn');
    expect(errorsOf({ openedOn: '2026-10-30' })).toHaveProperty('openedOn');
  });

  it('원장님 번호는 휴대폰만, 샵 번호는 지역번호·안심번호도 된다', () => {
    expect(errorsOf({ ownerPhone: '031-123-4567' })).toHaveProperty('ownerPhone');
    expect(errorsOf({ shopPhone: '0507-1234-5678' })).not.toHaveProperty('shopPhone');
    expect(errorsOf({ shopPhone: '1234' })).toHaveProperty('shopPhone');
  });

  it.each(['1234567', '12345678901234567', '1234-abcd'])(
    '계좌번호 %s는 8~16자리 숫자가 아니라 막는다',
    (value) => {
      expect(errorsOf({ accountNumber: value })).toHaveProperty('accountNumber');
    },
  );

  it('목록에 없는 은행·업종은 막는다', () => {
    expect(errorsOf({ bankCode: '999' as OwnerJoinForm['bankCode'] })).toHaveProperty('bankCode');
    expect(errorsOf({ category: 'spa' as OwnerJoinForm['category'] })).toHaveProperty('category');
  });

  it('필수 약관을 하나라도 안 고르면 막는다', () => {
    expect(
      errorsOf({ agreements: { supplier: true, privacy: true, payoutInfo: false } }),
    ).toHaveProperty('agreements');
  });

  it('글자 수를 넘으면 막는다', () => {
    expect(errorsOf({ ownerName: '가'.repeat(21) })).toHaveProperty('ownerName');
    expect(errorsOf({ shopName: '가'.repeat(41) })).toHaveProperty('shopName');
  });
});
