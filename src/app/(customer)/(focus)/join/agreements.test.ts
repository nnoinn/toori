import { describe, expect, it } from 'vitest';

import {
  AGREEMENT_ITEMS,
  allRequiredChecked,
  EMPTY_AGREEMENTS,
  formatHourLabel,
  formatMonthsLabel,
  toAgreementsInput,
  toggleAll,
} from './agreements';

const REQUIRED_ONLY = {
  ...EMPTY_AGREEMENTS,
  age14: true,
  service: true,
  privacy: true,
  location: true,
};

describe('고객 약관 동의', () => {
  it('필수 4개(만 14세·이용약관·개인정보·위치기반), 선택 1개(광고성 정보)', () => {
    expect(AGREEMENT_ITEMS.filter((item) => item.required).map((item) => item.key)).toEqual([
      'age14',
      'service',
      'privacy',
      'location',
    ]);
    expect(AGREEMENT_ITEMS.find((item) => item.key === 'marketing')?.required).toBe(false);
  });

  it('만 14세 확인에는 약관 본문 "보기"가 없다', () => {
    expect(AGREEMENT_ITEMS.find((item) => item.key === 'age14')?.hasDocument).toBe(false);
  });

  it('처음에는 모두 해제라 시작할 수 없다', () => {
    expect(allRequiredChecked(EMPTY_AGREEMENTS)).toBe(false);
    expect(toAgreementsInput(EMPTY_AGREEMENTS)).toBeNull();
  });

  it('필수만 체크하면 시작할 수 있고 광고성 동의는 false로 넘긴다(만 14세는 넘기지 않음)', () => {
    expect(toAgreementsInput(REQUIRED_ONLY)).toEqual({
      service: true,
      privacy: true,
      location: true,
      marketing: false,
    });
  });

  it('만 14세 확인이 빠지면 시작할 수 없다', () => {
    expect(toAgreementsInput({ ...REQUIRED_ONLY, age14: false })).toBeNull();
  });

  it('전체 동의는 모두 켜고, 다시 누르면 모두 끈다', () => {
    const on = toggleAll(EMPTY_AGREEMENTS);
    expect(Object.values(on).every(Boolean)).toBe(true);
    expect(toAgreementsInput(on)?.marketing).toBe(true);
    expect(toggleAll(on)).toEqual(EMPTY_AGREEMENTS);
  });

  it('일부만 켜져 있을 때 전체 동의를 누르면 모두 켠다', () => {
    expect(Object.values(toggleAll({ ...EMPTY_AGREEMENTS, service: true })).every(Boolean)).toBe(
      true,
    );
  });
});

describe('문구 안의 시각·기간', () => {
  it('시각', () => {
    expect(formatHourLabel(13)).toBe('오후 1시');
    expect(formatHourLabel(21)).toBe('밤 9시');
    expect(formatHourLabel(8)).toBe('아침 8시');
    expect(formatHourLabel(12)).toBe('오후 12시');
    expect(formatHourLabel(0)).toBe('밤 12시');
  });

  it('기간', () => {
    expect(formatMonthsLabel(24)).toBe('2년');
    expect(formatMonthsLabel(6)).toBe('6개월');
  });

  it('광고성 동의 설명에 정책값 시각이 들어간다(오후 1시, 밤 9시~아침 8시, 2년)', () => {
    const text = AGREEMENT_ITEMS.find((item) => item.key === 'marketing')?.description?.join(' ');
    expect(text).toContain('오후 1시');
    expect(text).toContain('밤 9시부터 아침 8시까지');
    expect(text).toContain('2년마다');
  });
});
