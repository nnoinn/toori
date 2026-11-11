// 회원 조회 화면 표시 모양 (A-102, W18).

/** 목록 탭. 주소 ?tab= 값 */
export const USER_TABS = ['customers', 'owners'] as const;
export type UserTab = (typeof USER_TABS)[number];

export function toUserTab(value: string | undefined): UserTab {
  return USER_TABS.find((tab) => tab === value) ?? 'customers';
}
