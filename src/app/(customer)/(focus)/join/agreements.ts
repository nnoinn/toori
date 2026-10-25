// 고객 약관 동의 항목과 규칙 (C-104, J8, D15·D16). 화면에서 쓴다.
// 문구는 docs/legal/consent-texts.md 1장(법률 검토 전 임시 문구). 문구 안의 숫자는 정책값에서 가져온다.
// 저장은 강규민님 createCustomerAccount({ agreements, next })(#47 1장)가 한다.

import { SITE_NAME } from '@/lib/site';
import {
  INTEREST_DIGEST_HOUR,
  MARKETING_CONSENT_RECHECK_MONTHS,
  PUSH_QUIET_HOURS,
} from '@/server/policy';

export type AgreementKey = 'age14' | 'service' | 'privacy' | 'location' | 'marketing';

export type AgreementItem = {
  key: AgreementKey;
  label: string;
  required: boolean;
  /** 약관 본문 "보기"가 있는지 */
  hasDocument: boolean;
  /** 항목 아래 짧은 설명(줄마다 하나) */
  description?: string[];
};

/** 시각을 문구로. 예: 13 → "오후 1시", 21 → "밤 9시", 8 → "아침 8시" */
export function formatHourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  if (hour >= 5 && hour < 12) return `아침 ${h12}시`;
  if (hour >= 12 && hour < 18) return `오후 ${h12}시`;
  if (hour >= 18 && hour < 21) return `저녁 ${h12}시`;
  return `밤 ${h12}시`;
}

/** 개월을 문구로. 예: 24 → "2년", 6 → "6개월" */
export function formatMonthsLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12}년` : `${months}개월`;
}

export const AGREEMENT_ITEMS: readonly AgreementItem[] = [
  { key: 'age14', label: '만 14세 이상이에요', required: true, hasDocument: false },
  { key: 'service', label: `${SITE_NAME} 이용약관 동의`, required: true, hasDocument: true },
  { key: 'privacy', label: '개인정보 수집·이용 동의', required: true, hasDocument: true },
  { key: 'location', label: '위치기반서비스 이용약관 동의', required: true, hasDocument: true },
  {
    key: 'marketing',
    label: '광고성 정보 수신 동의(관심 동네 새 매물 알림)',
    required: false,
    hasDocument: true,
    description: [
      `관심 동네에 새 매물이 올라오면 하루 한 번(${formatHourLabel(INTEREST_DIGEST_HOUR)}) 웹 푸시로 알려 드려요.`,
      // 광고성 정보 동의는 무엇을 보내는지 알려야 한다(동의 문구 1-2, #88 리뷰)
      '받는 정보: 관심 동네의 새 할인 매물 소식',
      `${formatHourLabel(PUSH_QUIET_HOURS.start)}부터 ${formatHourLabel(PUSH_QUIET_HOURS.end)}까지는 보내지 않아요.`,
      '동의하지 않아도 서비스는 그대로 쓸 수 있고, 내 정보 > 알림 설정에서 언제든 끌 수 있어요.',
      `동의하신 날부터 ${formatMonthsLabel(MARKETING_CONSENT_RECHECK_MONTHS)}마다 동의 여부를 다시 알려 드려요.`,
    ],
  },
];

export type AgreementState = Record<AgreementKey, boolean>;

/** 처음에는 모두 해제(광고성 동의도 기본 해제, D15) */
export const EMPTY_AGREEMENTS: AgreementState = {
  age14: false,
  service: false,
  privacy: false,
  location: false,
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
  return { age14: next, service: next, privacy: next, location: next, marketing: next };
}

/**
 * createCustomerAccount에 넘길 모양. 필수가 빠졌으면 null.
 * '만 14세 이상'은 가입 조건이라 체크해야 넘어가지만, #47 약속에는 저장할 자리가 없어서 넘기지 않는다(확인 요청 중)
 */
export function toAgreementsInput(
  state: AgreementState,
): { service: true; privacy: true; location: true; marketing: boolean } | null {
  if (!allRequiredChecked(state)) return null;
  return { service: true, privacy: true, location: true, marketing: state.marketing };
}
