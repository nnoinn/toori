import { describe, expect, it } from 'vitest';

import { REMINDER_MINUTES_BEFORE } from '@/server/policy';

import {
  formatReminderTimes,
  isIos,
  type PushEnv,
  pushSupport,
  urlBase64ToUint8Array,
} from './push-support';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const pc: PushEnv = {
  userAgent: WINDOWS_CHROME,
  maxTouchPoints: 0,
  standalone: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
};

describe('웹 푸시를 받을 수 있는 기기인지 (J14)', () => {
  it('PC 크롬은 바로 받을 수 있다', () => {
    expect(pushSupport(pc)).toBe('supported');
  });

  it('아이폰·아이패드는 홈 화면에 추가한 앱으로 열어야 받는다', () => {
    expect(isIos(IPHONE, 5)).toBe(true);
    expect(isIos(IPAD_AS_MAC, 5)).toBe(true);
    expect(isIos(IPAD_AS_MAC, 0)).toBe(false);
    // 아이패드는 손가락 여러 개를 받는다. 1개만 받는 맥은 아이패드가 아니다
    expect(isIos(IPAD_AS_MAC, 1)).toBe(false);
    expect(
      pushSupport({ ...pc, userAgent: IPHONE, maxTouchPoints: 5, hasPushManager: false }),
    ).toBe('ios-install');
    expect(pushSupport({ ...pc, userAgent: IPHONE, maxTouchPoints: 5, standalone: true })).toBe(
      'supported',
    );
  });

  it('홈 화면에 추가했어도 푸시 기능이 없으면(iOS 16.4 전) 받을 수 없다', () => {
    expect(
      pushSupport({
        ...pc,
        userAgent: IPHONE,
        maxTouchPoints: 5,
        standalone: true,
        hasPushManager: false,
      }),
    ).toBe('unsupported');
    expect(pushSupport({ ...pc, hasServiceWorker: false })).toBe('unsupported');
  });
});

describe('VAPID 공개 키 바꾸기', () => {
  it('base64url을 바이트로', () => {
    expect([...urlBase64ToUint8Array('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe('리마인드 시각 문구', () => {
  it('정책값으로 "시작 2시간 전·15분 전"', () => {
    expect(formatReminderTimes(REMINDER_MINUTES_BEFORE)).toBe('시작 2시간 전·15분 전');
    expect(formatReminderTimes([90])).toBe('시작 1시간 30분 전');
  });
});
