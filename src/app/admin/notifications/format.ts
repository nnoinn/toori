// 운영자 알림 확인 화면(#373 ⑤)의 주소와 문구. 화면('use client' 포함)이 쓴다.

/** 알림 확인 주소. 쪽은 ?tab=failed|no_device&page= */
export const NOTIFICATION_ISSUES_PATH = '/admin/notifications';

/** 목록 종류: 푸시 알림을 보냈는데 한 기기도 받지 못함 / 받을 기기가 없어서 알림함에만 남음 */
export const NOTIFICATION_ISSUE_TABS = ['failed', 'no_device'] as const;
export type NotificationIssueTab = (typeof NOTIFICATION_ISSUE_TABS)[number];

export const NOTIFICATION_ISSUE_TAB_LABELS: Record<NotificationIssueTab, string> = {
  failed: '보내지 못함',
  no_device: '기기 없음',
};

/** 주소의 tab 값. 모르는 값이면 보내지 못함 */
export function toNotificationIssueTab(value: string | undefined): NotificationIssueTab {
  return value === 'no_device' ? 'no_device' : 'failed';
}

/** 목록 주소. 첫 쪽이면 page를 넣지 않는다 */
export function notificationIssuesHref(input: { tab: NotificationIssueTab; page?: number }): string {
  const params = new URLSearchParams({ tab: input.tab });
  if (input.page && input.page > 1) params.set('page', String(input.page));
  return `${NOTIFICATION_ISSUES_PATH}?${params}`;
}

/** 받는 계정 종류 */
export const RECIPIENT_ACCOUNT_LABELS: Record<string, string> = {
  customer: '고객',
  owner: '원장님',
};

const PUSH_RESULT_LABELS: Record<string, string> = {
  expired: '구독 끝남',
  failed: '보내기 실패',
};

/** 기기마다 결과(쉼표로 이어 붙인 값)를 읽기 쉬운 말로. 없으면 '-' */
export function labelPushErrors(error: string | null): string {
  if (!error) return '-';
  return error
    .split(',')
    .map((result) => PUSH_RESULT_LABELS[result] ?? result)
    .join(', ');
}

/** [다시 보내기] 결과 안내 */
export const RESEND_RESULT_TEXT = {
  sent: '다시 보냈어요. 지금 그 계정의 푸시 알림 기기로 갔어요.',
  failed:
    '다시 보냈지만 한 기기도 받지 못했어요. 끝난 구독은 지웠고, 이 알림은 "보내지 못함"에 남아요.',
} as const;
