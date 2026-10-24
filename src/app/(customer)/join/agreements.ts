// 고객 약관 동의 항목과 규칙 (C-104, J8, D15·D16). 화면에서 쓴다.
// 저장은 강규민님 createCustomerAccount({ agreements, next })(#47 1장)가 한다.

export type AgreementKey = 'service' | 'privacy' | 'location' | 'marketing';

export type AgreementItem = {
  key: AgreementKey;
  label: string;
  required: boolean;
  /** 항목 아래 짧은 설명 */
  description?: string;
};

// 약관 본문은 현동훈님 초안이 나오면 붙인다(#16 R7·R12). 그 전에는 항목 이름만 둔다
export const AGREEMENT_ITEMS: readonly AgreementItem[] = [
  { key: 'service', label: '이용약관 동의', required: true },
  { key: 'privacy', label: '개인정보 처리방침 동의', required: true },
  { key: 'location', label: '위치정보 이용 동의', required: true },
  {
    key: 'marketing',
    label: '광고성 정보 수신 동의',
    required: false,
    description: '관심 동네의 새 매물 소식을 알림으로 받아요. 동의하지 않아도 가입할 수 있어요.',
  },
];

export type AgreementState = Record<AgreementKey, boolean>;

/** 처음에는 모두 해제(광고성 동의도 기본 해제, D15) */
export const EMPTY_AGREEMENTS: AgreementState = {
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
  return { service: next, privacy: next, location: next, marketing: next };
}

/** createCustomerAccount에 넘길 모양. 필수가 빠졌으면 null */
export function toAgreementsInput(
  state: AgreementState,
): { service: true; privacy: true; location: true; marketing: boolean } | null {
  if (!allRequiredChecked(state)) return null;
  return { service: true, privacy: true, location: true, marketing: state.marketing };
}
