// 관심 화면(C-211) 탭. 주소창 ?tab= 으로 고른다. 화면과 테스트가 같이 쓴다.
// 명세 순서대로 [매물 보기]가 먼저이고 기본이다(🟡 docs/stage3-spec.md C-211)

export const INTEREST_PATH = '/home/favorites';

export const INTEREST_TABS = [
  { key: 'slots', label: '매물 보기' },
  { key: 'shops', label: '샵 보기' },
] as const;

export type InterestTab = (typeof INTEREST_TABS)[number]['key'];

const DEFAULT_TAB: InterestTab = 'slots';

/** 주소창 값을 탭으로 읽는다. 모르는 값이면 기본(매물 보기) */
export function parseInterestTab(value: string | string[] | undefined): InterestTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return INTEREST_TABS.some((tab) => tab.key === raw) ? (raw as InterestTab) : DEFAULT_TAB;
}

/** 탭 주소. 기본 탭이면 주소를 짧게 둔다. 예: /home/favorites, /home/favorites?tab=shops */
export function interestTabHref(tab: InterestTab): string {
  return tab === DEFAULT_TAB ? INTEREST_PATH : `${INTEREST_PATH}?tab=${tab}`;
}
