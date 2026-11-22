import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NOTIFICATION_ACCOUNTS } from '@/server/notifications/inbox-types';

import { CUSTOMER_NOTIFICATION_ACCOUNT, NOTIFICATIONS_PATH } from './notification-rules';

// 고객 알림함(#371). 종·화면 안내가 여는 주소에 화면이 있고, 알림함 함수에 고객 계정('customer')을 넘기는지 본다.
// 시각 문구와 누르면 갈 주소는 공통 규칙 테스트(src/components/ui/notification-inbox-rules.test.ts)가 본다
describe('고객 알림함 주소와 계정', () => {
  it('종·화면 안내가 여는 주소(/notifications)에 이 화면이 있다', () => {
    expect(NOTIFICATIONS_PATH).toBe('/notifications');
    const page = path.join(
      process.cwd(),
      'src/app/(customer)/(tabs)',
      NOTIFICATIONS_PATH.replace('/', ''),
      'page.tsx',
    );
    expect(existsSync(page)).toBe(true);
  });

  it('알림함 함수에 고객 계정을 넘긴다(원장님 계정 owner가 아님)', () => {
    expect(CUSTOMER_NOTIFICATION_ACCOUNT).toBe('customer');
    expect(NOTIFICATION_ACCOUNTS).toContain(CUSTOMER_NOTIFICATION_ACCOUNT);
  });
});
