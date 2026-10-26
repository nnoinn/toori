import { describe, expect, it } from 'vitest';

import { REFUND_BANDS } from '@/server/policy';

import {
  formatBusinessHours,
  formatDuration,
  refundPolicyLines,
  safeExternalUrl,
  telHref,
} from './detail-format';

describe('영업시간', () => {
  it('월요일부터 7줄, 입력 안 한 요일은 "정보 없음"', () => {
    const rows = formatBusinessHours([
      { weekday: 1, open: '10:00', close: '20:00' },
      { weekday: 0, closed: true },
    ]);
    expect(rows?.map((row) => `${row.label} ${row.text}`)).toEqual([
      '월 10:00 ~ 20:00',
      '화 정보 없음',
      '수 정보 없음',
      '목 정보 없음',
      '금 정보 없음',
      '토 정보 없음',
      '일 휴무',
    ]);
  });

  it('비어 있거나 모양이 틀리면 null(칸 숨김)', () => {
    expect(formatBusinessHours([])).toBeNull();
    expect(formatBusinessHours(null)).toBeNull();
    expect(formatBusinessHours([{ weekday: 9, open: '10:00', close: '20:00' }])).toBeNull();
    expect(formatBusinessHours([{ weekday: 1, open: '25:00', close: '20:00' }])).toBeNull();
  });

  it('같은 요일이 두 번 있으면 앞의 것만', () => {
    const rows = formatBusinessHours([
      { weekday: 2, open: '09:00', close: '18:00' },
      { weekday: 2, closed: true },
    ]);
    expect(rows?.find((row) => row.weekday === 2)?.text).toBe('09:00 ~ 18:00');
  });
});

describe('소요 시간', () => {
  it('시간·분으로 보여준다', () => {
    expect(formatDuration(45)).toBe('45분');
    expect(formatDuration(60)).toBe('1시간');
    expect(formatDuration(90)).toBe('1시간 30분');
    expect(formatDuration(0)).toBe('');
  });
});

describe('외부 링크', () => {
  it('https 주소만 받는다', () => {
    expect(safeExternalUrl('https://instagram.com/toori_shop')).toBe(
      'https://instagram.com/toori_shop',
    );
    expect(safeExternalUrl(' https://naver.me/abc ')).toBe('https://naver.me/abc');
  });

  it('위험하거나 이상한 주소는 숨긴다', () => {
    for (const value of [
      'javascript:alert(1)',
      'http://instagram.com/x',
      'data:text/html,hi',
      'instagram.com/x',
      '',
      null,
      undefined,
    ]) {
      expect(safeExternalUrl(value)).toBeNull();
    }
  });
});

describe('전화 링크', () => {
  it('숫자만 남긴다', () => {
    expect(telHref('031-123-4567')).toBe('tel:0311234567');
    expect(telHref('123')).toBeNull();
  });
});

describe('환불 규정 안내', () => {
  it('정책값으로 3구간을 만든다', () => {
    expect(refundPolicyLines(REFUND_BANDS)).toEqual([
      '시작 24시간 전까지: 70% 환불(위약금 30%)',
      '24~6시간 전: 50% 환불(위약금 50%)',
      '6시간 이내: 환불 불가',
    ]);
  });

  it('정책값이 바뀌면 문구도 바뀐다', () => {
    expect(
      refundPolicyLines([
        { minHoursLeft: 48, penaltyRate: 10 },
        { minHoursLeft: 0, penaltyRate: 100 },
      ]),
    ).toEqual(['시작 48시간 전까지: 90% 환불(위약금 10%)', '48시간 이내: 환불 불가']);
  });
});
