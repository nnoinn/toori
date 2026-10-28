// 계산 함수가 없는 정책값이 CLAUDE.md 핵심 비즈니스 규칙·#48 확정본과 같은지 확인한다.
// 값을 바꿔야 하면 #48에 먼저 알리고 이 테스트도 같이 고친다.

import { describe, expect, it } from 'vitest';

import { TERMS_TYPES } from '@/db/schema/accounts';

import { PRICE_FILTER_RANGES, TIME_FILTER_RANGES } from './filters';
import {
  INTEREST_DIGEST_HOUR,
  MARKETING_CONSENT_RECHECK_MONTHS,
  PUSH_QUIET_HOURS,
  REMINDER_MINUTES_BEFORE,
} from './notifications';
import {
  COUPON_VALID_DAYS,
  OWNER_FAULT_COUPON_AMOUNT,
  OWNER_FAULT_PENALTY_AMOUNT,
} from './owner-fault';
import { NO_SHOW_PENALTY_RATE, REFUND_BANDS } from './refund';
import {
  HOLD_MINUTES,
  IMMINENT_WITHIN_HOURS,
  MENU_DURATION_STEP_MINUTES,
  NON_REFUNDABLE_WITHIN_HOURS,
  PUBLISH_WINDOW_HOURS,
  SLOT_START_STEP_MINUTES,
} from './slot-time';
import { TERMS_VERSIONS } from './terms';
import {
  BUSINESS_DOC_ALLOWED_TYPES,
  BUSINESS_DOC_URL_TTL_SECONDS,
  UPLOAD_ALLOWED_TYPES,
  UPLOAD_MAX_BYTES,
} from './upload';

describe('시간 (#48 1장)', () => {
  it('48시간 게시, 6시간 임박·환불 불가, 10분 홀딩, 시작 시각·소요 시간 30분 단위', () => {
    expect(PUBLISH_WINDOW_HOURS).toBe(48);
    expect(IMMINENT_WITHIN_HOURS).toBe(6);
    expect(NON_REFUNDABLE_WITHIN_HOURS).toBe(6);
    expect(HOLD_MINUTES).toBe(10);
    expect(SLOT_START_STEP_MINUTES).toBe(30);
    expect(MENU_DURATION_STEP_MINUTES).toBe(30);
  });
});

describe('환불 (#48 2장)', () => {
  it('24시간 이상 30%, 6시간 이상 50%, 그 미만 100%이고 남은 시간이 긴 구간부터 있다', () => {
    expect(REFUND_BANDS).toEqual([
      { minHoursLeft: 24, penaltyRate: 30 },
      { minHoursLeft: 6, penaltyRate: 50 },
      { minHoursLeft: 0, penaltyRate: 100 },
    ]);
  });

  it('환불 불가(100%) 구간이 시작되는 시간은 환불 불가 뱃지 기준과 같다', () => {
    const lastPartialBand = REFUND_BANDS.at(-2);
    expect(lastPartialBand?.minHoursLeft).toBe(NON_REFUNDABLE_WITHIN_HOURS);
    expect(REFUND_BANDS.at(-1)?.penaltyRate).toBe(100);
  });

  it('노쇼는 위약금 100%', () => {
    expect(NO_SHOW_PENALTY_RATE).toBe(100);
  });
});

describe('쿠폰·원장님 귀책 (#48 5장)', () => {
  it('쿠폰 3,000원·90일, 패널티 5,000원', () => {
    expect(OWNER_FAULT_COUPON_AMOUNT).toBe(3000);
    expect(COUPON_VALID_DAYS).toBe(90);
    expect(OWNER_FAULT_PENALTY_AMOUNT).toBe(5000);
  });
});

describe('알림·동의 (#48 6장)', () => {
  it('리마인드 2시간·15분 전, 관심 지역 13시, 21시~8시 금지, 24개월 재확인', () => {
    expect(REMINDER_MINUTES_BEFORE).toEqual([120, 15]);
    expect(INTEREST_DIGEST_HOUR).toBe(13);
    expect(PUSH_QUIET_HOURS).toEqual({ start: 21, end: 8 });
    expect(MARKETING_CONSENT_RECHECK_MONTHS).toBe(24);
  });

  it('관심 지역 알림 시각은 야간 금지 시간이 아니다', () => {
    expect(INTEREST_DIGEST_HOUR).toBeGreaterThanOrEqual(PUSH_QUIET_HOURS.end);
    expect(INTEREST_DIGEST_HOUR).toBeLessThan(PUSH_QUIET_HOURS.start);
  });

  it('약관 버전은 DB의 약관 종류마다 하나씩 있다', () => {
    expect(Object.keys(TERMS_VERSIONS).sort()).toEqual([...TERMS_TYPES].sort());
  });
});

describe('필터 구간 (#48 7장)', () => {
  it.each([
    ['가격', PRICE_FILTER_RANGES],
    ['시간', TIME_FILTER_RANGES],
  ])('%s 구간은 처음과 끝이 열려 있고 빈틈·겹침 없이 이어진다', (_, ranges) => {
    expect(ranges[0].min).toBeNull();
    expect(ranges.at(-1)?.max).toBeNull();
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].min).toBe(ranges[i - 1].max);
    }
    expect(new Set(ranges.map((r) => r.key)).size).toBe(ranges.length);
  });
});

describe('업로드 (#48 8장)', () => {
  it('5MB는 5,000,000바이트(버킷 5MiB보다 작게), 샵 사진은 jpeg·png·webp, 등록증은 PDF까지, 등록증 주소는 5분', () => {
    expect(UPLOAD_MAX_BYTES).toBe(5_000_000);
    expect(UPLOAD_ALLOWED_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(BUSINESS_DOC_ALLOWED_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]);
    expect(BUSINESS_DOC_URL_TTL_SECONDS).toBe(300);
  });
});
