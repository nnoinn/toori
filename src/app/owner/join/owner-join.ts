// 원장님 가입 입력값 검사와 약관 항목 (O7 ①, S-101·S-107·S-108, #23 D3·D17). 화면('use client')에서 쓴다.
// 저장은 강규민님 createOwnerAccount(#47 4장)가 하고, 서버가 같은 규칙으로 다시 검사한다. 화면 검사는 바로 알려 주려는 것이다.
// 약관 문구는 docs/legal/consent-texts.md 2장(법률 검토 전 임시 문구).

import { normalizePhone } from '@/lib/phone';
import { SITE_NAME } from '@/lib/site';
import type { BankCode } from '@/server/policy';
import { SHOP_CATEGORY_KEYS, type ShopCategory } from '@/server/policy/catalog';
import type { CreateOwnerAccountInput } from '@/server/auth/owner-account';

import { SHOP_PROFILE_LIMITS } from '../(console)/settings/shop/shop-profile';
import {
  checkRequired,
  OWNER_FIELD_LIMITS,
  validateBusinessInput,
  validatePayoutInput,
} from '../business-fields';

// ---- 약관 (필수 3개, 원장님은 광고성 정보 동의가 없다) ----

export type OwnerAgreementKey = keyof CreateOwnerAccountInput['agreements'];

export const OWNER_AGREEMENT_ITEMS: readonly { key: OwnerAgreementKey; label: string }[] = [
  { key: 'supplier', label: `${SITE_NAME} 원장님 이용약관 동의` },
  { key: 'privacy', label: '개인정보 수집·이용 동의(원장님)' },
  { key: 'payoutInfo', label: '정산을 위한 정보 제공 동의' },
];

export type OwnerAgreements = Record<OwnerAgreementKey, boolean>;

// ---- 입력 칸 ----

export type OwnerJoinForm = {
  ownerName: string;
  ownerPhone: string;
  businessName: string;
  representativeName: string;
  businessRegistrationNumber: string;
  /** YYYY-MM-DD (date 입력) */
  openedOn: string;
  /** 올린 사업자등록증 경로. 올리기 전이면 빈 문자열 */
  businessDocPath: string;
  shopName: string;
  category: ShopCategory | '';
  shopPhone: string;
  roadAddress: string;
  addressDetail: string;
  bankCode: BankCode | '';
  accountNumber: string;
  accountHolder: string;
  agreements: OwnerAgreements;
};

export type OwnerJoinField = Exclude<keyof OwnerJoinForm, 'agreements'> | 'agreements';
export type OwnerJoinFieldErrors = Partial<Record<OwnerJoinField, string>>;

export const EMPTY_OWNER_JOIN_FORM: OwnerJoinForm = {
  ownerName: '',
  ownerPhone: '',
  businessName: '',
  representativeName: '',
  businessRegistrationNumber: '',
  openedOn: '',
  businessDocPath: '',
  shopName: '',
  category: '',
  shopPhone: '',
  roadAddress: '',
  addressDetail: '',
  bankCode: '',
  accountNumber: '',
  accountHolder: '',
  agreements: { supplier: false, privacy: false, payoutInfo: false },
};

/**
 * 입력값을 검사해서 createOwnerAccount 입력으로 바꾼다. today는 한국 날짜(YYYY-MM-DD)로, 개업일자가 그 뒤면 막는다.
 * 사업자 정보·정산 계좌 검사는 매장 설정과 같이 쓴다(business-fields.ts). 실패하면 칸별 문구
 */
export function validateOwnerJoin(
  form: OwnerJoinForm,
  today: string,
): { ok: true; data: CreateOwnerAccountInput } | { ok: false; fieldErrors: OwnerJoinFieldErrors } {
  const errors: OwnerJoinFieldErrors = {};

  const ownerName = checkRequired(
    errors,
    'ownerName',
    form.ownerName,
    '이름',
    OWNER_FIELD_LIMITS.personName,
  );
  const ownerPhone = normalizePhone(form.ownerPhone, 'mobile');
  if (!ownerPhone) errors.ownerPhone = '휴대폰 번호를 다시 확인해 주세요(예: 010-1234-5678)';

  const business = validateBusinessInput(form, today);
  if (!business.ok) Object.assign(errors, business.fieldErrors);

  const shopName = checkRequired(
    errors,
    'shopName',
    form.shopName,
    '샵 이름',
    SHOP_PROFILE_LIMITS.name,
  );
  const category = form.category;
  if (!category || !SHOP_CATEGORY_KEYS.includes(category)) errors.category = '업종을 골라 주세요';
  const shopPhone = normalizePhone(form.shopPhone);
  if (!shopPhone) errors.shopPhone = '샵 전화번호를 다시 확인해 주세요(예: 031-123-4567)';
  const roadAddress = form.roadAddress.trim();
  if (roadAddress === '') errors.roadAddress = '주소 찾기로 주소를 골라 주세요';
  const addressDetail = form.addressDetail.trim();
  if (addressDetail.length > SHOP_PROFILE_LIMITS.addressDetail) {
    errors.addressDetail = `${SHOP_PROFILE_LIMITS.addressDetail}자 이하로 입력해 주세요`;
  }

  const payout = validatePayoutInput(form);
  if (!payout.ok) Object.assign(errors, payout.fieldErrors);

  if (!Object.values(form.agreements).every(Boolean)) {
    errors.agreements = '필수 항목에 모두 동의해 주세요';
  }

  if (
    Object.keys(errors).length > 0 ||
    !ownerPhone ||
    !shopPhone ||
    !category ||
    !business.ok ||
    !payout.ok
  ) {
    return { ok: false, fieldErrors: errors };
  }
  return {
    ok: true,
    data: {
      owner: { name: ownerName, phone: ownerPhone },
      shop: {
        ...business.data,
        name: shopName,
        category,
        phone: shopPhone,
        roadAddress,
        ...(addressDetail ? { addressDetail } : {}),
      },
      payout: payout.data,
      agreements: { supplier: true, privacy: true, payoutInfo: true },
    },
  };
}

/** 칸을 위에서부터 보여 줄 때 처음 오류가 난 칸(그 칸으로 스크롤한다) */
export const OWNER_JOIN_FIELD_ORDER: readonly OwnerJoinField[] = [
  'ownerName',
  'ownerPhone',
  'businessName',
  'representativeName',
  'businessRegistrationNumber',
  'openedOn',
  'businessDocPath',
  'shopName',
  'category',
  'shopPhone',
  'roadAddress',
  'addressDetail',
  'bankCode',
  'accountNumber',
  'accountHolder',
  'agreements',
];
