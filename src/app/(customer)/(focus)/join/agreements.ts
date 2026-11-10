// 고객 약관 동의 항목과 규칙 (C-104, J8, D15·D16). 화면에서 쓴다.
// 문구는 docs/legal/consent-texts.md 1장(법률 검토 전 임시 문구). 문구 안의 숫자는 정책값에서 가져온다.
// 저장은 강규민님 createCustomerAccount({ agreements, next })(#47 1장)가 한다.

import { OPTIONAL_CONSENT_NAMES } from '@/app/(customer)/(tabs)/me/profile-rules';
import { SITE_NAME } from '@/lib/site';
import { formatHourLabel } from '@/lib/time';
import {
  INTEREST_DIGEST_HOUR,
  MARKETING_CONSENT_RECHECK_MONTHS,
  PUSH_QUIET_HOURS,
} from '@/server/policy';

export type AgreementKey =
  'age14' | 'service' | 'privacy' | 'location' | 'interest_alert' | 'marketing';

export type AgreementItem = {
  key: AgreementKey;
  label: string;
  required: boolean;
  /** 약관 본문 "보기"가 있는지 */
  hasDocument: boolean;
  /** 항목 아래 짧은 설명(줄마다 하나) */
  description?: string[];
};

/** 개월을 문구로. 예: 24 → "2년", 6 → "6개월" */
export function formatMonthsLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
}

const QUIET_HOURS_LINE = `${formatHourLabel(PUSH_QUIET_HOURS.start)}부터 ${formatHourLabel(PUSH_QUIET_HOURS.end)}까지는 보내지 않아요.`;
const TURN_OFF_LINE = '내 정보 > 알림 설정에서 언제든 끌 수 있어요.';
const RECHECK_LINE = `동의하신 날부터 ${formatMonthsLabel(MARKETING_CONSENT_RECHECK_MONTHS)}마다 동의 여부를 다시 알려 드려요.`;

export const AGREEMENT_ITEMS: readonly AgreementItem[] = [
  { key: 'age14', label: '만 14세 이상이에요', required: true, hasDocument: false },
  { key: 'service', label: `${SITE_NAME} 이용약관 동의`, required: true, hasDocument: true },
  { key: 'privacy', label: '개인정보 수집·이용 동의', required: true, hasDocument: true },
  { key: 'location', label: '위치기반서비스 이용약관 동의', required: true, hasDocument: true },
  {
    // 지금 받을 수 있는 알림이라 위에 둔다(#267, 동의 문구 7장)
    key: 'interest_alert',
    label: `${OPTIONAL_CONSENT_NAMES.interest_alert} 수신 동의`,
    required: false,
    hasDocument: true,
    description: [
      `관심 동네나 찜한 샵에 새 매물이 올라오면 하루 한 번(${formatHourLabel(INTEREST_DIGEST_HOUR)}) 웹 푸시로 알려 드려요.`,
      // 광고성 정보 동의는 무엇을 보내는지 알려야 한다(동의 문구 1-2, #88 리뷰)
      '받는 정보: 관심 동네와 찜한 샵의 새 할인 매물 소식(광고성 정보)',
      QUIET_HOURS_LINE,
      `${OPTIONAL_CONSENT_NAMES.marketing} 동의와 따로 켜고 끌 수 있어요.`,
      TURN_OFF_LINE,
      RECHECK_LINE,
    ],
  },
  {
    key: 'marketing',
    label: `${OPTIONAL_CONSENT_NAMES.marketing} 수신 동의`,
    required: false,
    hasDocument: true,
    description: [
      `${SITE_NAME}의 ${OPTIONAL_CONSENT_NAMES.marketing}을 웹 푸시로 알려 드려요.`,
      '받는 정보: 할인 이벤트, 쿠폰 같은 혜택 소식',
      QUIET_HOURS_LINE,
      '동의하지 않아도 서비스는 그대로 쓸 수 있어요.',
      TURN_OFF_LINE,
      RECHECK_LINE,
    ],
  },
];

export type AgreementState = Record<AgreementKey, boolean>;

/** 처음에는 모두 해제(선택 동의도 기본 해제, D15) */
export const EMPTY_AGREEMENTS: AgreementState = {
  age14: false,
  service: false,
  privacy: false,
  location: false,
  interest_alert: false,
  marketing: false,
};

export function allRequiredChecked(state: AgreementState): boolean {
  return AGREEMENT_ITEMS.every((item) => !item.required || state[item.key]);
}

export function allChecked(state: AgreementState): boolean {
  return AGREEMENT_ITEMS.every((item) => state[item.key]);
}

/** '전체 동의'를 누르면 모두 켜거나, 이미 모두 켜져 있으면 모두 끈다 */
export function toggleAll(state: AgreementState): AgreementState {
  const next = !allChecked(state);
  return {
    age14: next,
    service: next,
    privacy: next,
    location: next,
    interest_alert: next,
    marketing: next,
  };
}

/** createCustomerAccount에 넘길 동의 값(#47 4장) */
export type AgreementsInput = {
  age14: true;
  service: true;
  privacy: true;
  location: true;
  interest_alert: boolean;
  marketing: boolean;
};

/** createCustomerAccount에 넘길 모양. 필수가 빠졌으면 null */
export function toAgreementsInput(state: AgreementState): AgreementsInput | null {
  if (!allRequiredChecked(state)) return null;
  return {
    age14: true,
    service: true,
    privacy: true,
    location: true,
    interest_alert: state.interest_alert,
    marketing: state.marketing,
  };
}
