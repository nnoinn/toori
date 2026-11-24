// 2년마다 광고성 정보 수신 동의 확인(#535)의 날짜 계산과 문구. 시각은 모두 한국 시간으로 적는다.
// 기댓값의 근거: 정보통신망법 시행령 62조의3(수신동의를 받은 날부터 2년마다 확인), 동의 문구 6-2장, MARKETING_CONSENT_RECHECK_MONTHS(24)

import { describe, expect, it } from 'vitest';

import { MARKETING_CONSENT_RECHECK_MONTHS, NOTIFICATION_INBOX_DAYS } from '@/server/policy';

import {
  consentRecheckDay,
  consentRecheckKey,
  consentRecheckRound,
  consentRecheckText,
  dueRecheckRound,
  RECHECK_SEND_DAYS,
  recheckAgreedBefore,
} from './consent-recheck-rules';

const EVERY = MARKETING_CONSENT_RECHECK_MONTHS;
const kst = (text: string) => new Date(`${text}+09:00`);

describe('consentRecheckRound: 몇 번째 확인 차례인지', () => {
  // 오후 3시에 동의해도 2년 뒤 그날 오후 1시 작업에서 보낸다(시각이 아니라 한국 날짜로 센다)
  const AGREED = kst('2024-11-23T15:00:00');

  it.each([
    ['2년 되기 하루 전', '2026-11-22T23:59:00', 0],
    ['2년 되는 날 0시', '2026-11-23T00:00:00', 1],
    ['2년 되는 날 오후 1시(동의한 시각보다 이름)', '2026-11-23T13:00:00', 1],
    ['4년 되기 하루 전', '2028-11-22T13:00:00', 1],
    ['4년 되는 날', '2028-11-23T13:00:00', 2],
    ['동의한 날', '2024-11-23T16:00:00', 0],
  ])('%s → %i', (_, now, round) => {
    expect(consentRecheckRound(AGREED, kst(now), EVERY)).toBe(round);
  });

  it('한국 날짜로 센다: UTC로는 전날인 한국 새벽 동의도 한국 날짜 기준 2년', () => {
    // 한국 11/23 새벽 1시 = UTC 11/22 16시
    const agreed = kst('2024-11-23T01:00:00');
    expect(consentRecheckRound(agreed, kst('2026-11-22T13:00:00'), EVERY)).toBe(0);
    expect(consentRecheckRound(agreed, kst('2026-11-23T13:00:00'), EVERY)).toBe(1);
  });

  it('2/29에 동의하면 2년 뒤 2월 28일(그 달 마지막 날)이 확인 날이다', () => {
    const agreed = kst('2024-02-29T10:00:00');
    expect(consentRecheckRound(agreed, kst('2026-02-27T13:00:00'), EVERY)).toBe(0);
    expect(consentRecheckRound(agreed, kst('2026-02-28T13:00:00'), EVERY)).toBe(1);
    // 4년 뒤는 윤년이라 2월 29일
    expect(consentRecheckRound(agreed, kst('2028-02-28T13:00:00'), EVERY)).toBe(1);
    expect(consentRecheckRound(agreed, kst('2028-02-29T13:00:00'), EVERY)).toBe(2);
  });

  it('미래 동의 시각이면 0', () => {
    expect(consentRecheckRound(kst('2027-01-01T10:00:00'), kst('2026-11-23T13:00:00'), EVERY)).toBe(
      0,
    );
  });
});

describe('consentRecheckDay: 확인 날(한국 날짜 0시)', () => {
  it.each([
    ['2024-11-23T15:00:00', 1, '2026-11-23T00:00:00'],
    ['2024-11-23T15:00:00', 2, '2028-11-23T00:00:00'],
    ['2024-02-29T10:00:00', 1, '2026-02-28T00:00:00'],
    ['2024-02-29T10:00:00', 2, '2028-02-29T00:00:00'],
    ['2024-12-31T23:30:00', 1, '2026-12-31T00:00:00'],
  ])('%s 동의, %i번째 → %s', (agreed, round, day) => {
    expect(consentRecheckDay(kst(agreed), round, EVERY)).toEqual(kst(day));
  });
});

describe('dueRecheckRound: 지금 보낼 차례', () => {
  const AGREED = kst('2024-11-23T15:00:00');

  it.each([
    ['2년 되기 하루 전', '2026-11-22T13:00:00', null],
    ['2년 되는 날', '2026-11-23T13:00:00', 1],
    ['확인 날부터 29일 뒤(작업이 멈췄다 다시 돎)', '2026-12-22T13:00:00', 1],
    ['확인 날부터 30일 뒤 → 그 차례는 건너뜀', '2026-12-23T13:00:00', null],
    ['확인 날부터 90일 뒤(알림함에서 지워진 뒤) → 다시 보내지 않음', '2027-02-21T13:00:00', null],
    ['4년 되는 날', '2028-11-23T13:00:00', 2],
  ])('%s → %s', (_, now, round) => {
    expect(dueRecheckRound(AGREED, kst(now), EVERY)).toBe(round);
  });

  it('보내는 기간은 알림함 보관 기간보다 짧다(지워진 뒤 같은 차례를 다시 보내지 않게)', () => {
    expect(RECHECK_SEND_DAYS).toBeLessThan(NOTIFICATION_INBOX_DAYS);
  });
});

describe('recheckAgreedBefore: DB에서 미리 거르는 기준', () => {
  it('보낼 차례인 동의는 모두 기준 전이다(2/29 동의의 2월 28일 확인 날 포함)', () => {
    const cases = [
      ['2024-11-23T15:00:00', '2026-11-23T13:00:00'],
      ['2024-11-23T23:59:00', '2026-11-23T00:01:00'],
      ['2024-02-29T23:00:00', '2026-02-28T13:00:00'],
      ['2024-03-31T23:00:00', '2026-03-31T00:30:00'],
    ];
    for (const [agreed, now] of cases) {
      expect(dueRecheckRound(kst(agreed), kst(now), EVERY)).toBe(1);
      expect(kst(agreed).getTime()).toBeLessThan(recheckAgreedBefore(kst(now), EVERY).getTime());
    }
  });
});

describe('consentRecheckKey', () => {
  it('동의 하나의 차례마다 다르다', () => {
    expect(consentRecheckKey('a1', 1)).toBe('consent.recheck:a1:1');
    expect(consentRecheckKey('a1', 2)).not.toBe(consentRecheckKey('a1', 1));
    expect(consentRecheckKey('a2', 1)).not.toBe(consentRecheckKey('a1', 1));
  });
});

describe('consentRecheckText: 동의 문구 6-2장', () => {
  it('보내는 곳·동의한 한국 날짜·동의 이름·끄는 방법을 담고 (광고)는 붙이지 않는다', () => {
    // 한국 11/23 새벽 1시(UTC로는 11/22) 동의
    const text = consentRecheckText('marketing', kst('2024-11-23T01:00:00'));
    expect(text).toEqual({
      title: '이벤트·혜택 소식 수신 동의 확인',
      body: '투리 · 2024년 11월 23일에 이벤트·혜택 소식(광고성 정보) 수신에 동의하셨어요. 계속 받으시려면 하실 일이 없어요. 그만 받으려면 내 정보 > 알림 설정에서 끌 수 있어요.',
    });
  });

  it('관심 동네·찜한 샵 새 매물 알림 동의는 그 이름으로', () => {
    const text = consentRecheckText('interest_alert', kst('2024-03-05T10:00:00'));
    expect(text.title).toBe('관심 동네·찜한 샵 새 매물 알림 수신 동의 확인');
    expect(text.body).toContain('2024년 3월 5일에 관심 동네·찜한 샵 새 매물 알림(광고성 정보)');
    expect(text.title).not.toContain('(광고)');
  });
});
