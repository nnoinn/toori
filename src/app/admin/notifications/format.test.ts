// 운영자 알림 확인 화면(#373 ⑤)의 주소와 문구.

import { describe, expect, it } from 'vitest';

import { labelPushErrors, notificationIssuesHref, toNotificationIssueTab } from './format';

describe('알림 확인 주소와 문구', () => {
  it('모르는 종류는 보내지 못함이고, 첫 쪽이면 주소에 쪽을 넣지 않는다', () => {
    expect(toNotificationIssueTab('no_device')).toBe('no_device');
    expect(toNotificationIssueTab('sent')).toBe('failed');
    expect(toNotificationIssueTab(undefined)).toBe('failed');
    expect(notificationIssuesHref({ tab: 'failed' })).toBe('/admin/notifications?tab=failed');
    expect(notificationIssuesHref({ tab: 'no_device', page: 1 })).toBe(
      '/admin/notifications?tab=no_device',
    );
    expect(notificationIssuesHref({ tab: 'no_device', page: 3 })).toBe(
      '/admin/notifications?tab=no_device&page=3',
    );
  });

  it('기기마다 결과를 읽기 쉬운 말로 바꾸고 모르는 값은 그대로 둔다', () => {
    expect(labelPushErrors('expired,failed')).toBe('구독 끝남, 보내기 실패');
    expect(labelPushErrors('timeout')).toBe('timeout');
    expect(labelPushErrors(null)).toBe('-');
  });
});
