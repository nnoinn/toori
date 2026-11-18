import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NOTIFICATION_ACCOUNTS } from '@/server/notifications/inbox-types';

import { OWNER_NOTIFICATION_ACCOUNT, OWNER_NOTIFICATIONS_PATH } from './owner-notifications';

// 원장님 알림함(#371). 종·화면 안내가 여는 주소에 화면이 있고, 알림함 함수에 원장님 계정('owner')을 넘기는지 본다
describe('원장님 알림함 주소와 계정', () => {
  it('종·화면 안내가 여는 주소(/owner/notifications)에 이 화면이 있다', () => {
    expect(OWNER_NOTIFICATIONS_PATH).toBe('/owner/notifications');
    const page = path.join(
      process.cwd(),
      'src/app/owner/(console)',
      OWNER_NOTIFICATIONS_PATH.replace('/owner/', ''),
      'page.tsx',
    );
    expect(existsSync(page)).toBe(true);
  });

  it('알림함 함수에 원장님 계정을 넘긴다(고객 기본값 customer가 아님)', () => {
    expect(OWNER_NOTIFICATION_ACCOUNT).toBe('owner');
    expect(NOTIFICATION_ACCOUNTS).toContain(OWNER_NOTIFICATION_ACCOUNT);
  });
});
