import { describe, expect, it } from 'vitest';

import {
  AGREEMENT_ITEMS,
  allRequiredChecked,
  EMPTY_AGREEMENTS,
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
  it('필수 4개(만 14세·이용약관·개인정보·위치기반), 선택 2개(관심 동네·찜한 샵 알림이 위)', () => {
    expect(AGREEMENT_ITEMS.filter((item) => item.required).map((item) => item.key)).toEqual([
      'age14',
      'service',
      'privacy',
      'location',
    ]);
    expect(AGREEMENT_ITEMS.filter((item) => !item.required).map((item) => item.key)).toEqual([
      'interest_alert',
      'marketing',
    ]);
  });

  it('만 14세 확인에는 약관 본문 "보기"가 없다', () => {
    expect(AGREEMENT_ITEMS.find((item) => item.key === 'age14')?.hasDocument).toBe(false);
  });

  it('처음에는 모두 해제라 시작할 수 없다', () => {
    expect(allRequiredChecked(EMPTY_AGREEMENTS)).toBe(false);
    expect(toAgreementsInput(EMPTY_AGREEMENTS)).toBeNull();
  });

  it('필수만 체크하면 시작할 수 있고 선택 동의는 둘 다 false로 넘긴다', () => {
    expect(toAgreementsInput(REQUIRED_ONLY)).toEqual({
      age14: true,
      service: true,
      privacy: true,
      location: true,
      interest_alert: false,
      marketing: false,
    });
  });

  it('선택 동의는 고른 것만 true로 넘긴다', () => {
    expect(toAgreementsInput({ ...REQUIRED_ONLY, interest_alert: true })).toMatchObject({
      interest_alert: true,
      marketing: false,
    });
  });

  it('만 14세 확인이 빠지면 시작할 수 없다', () => {
    expect(toAgreementsInput({ ...REQUIRED_ONLY, age14: false })).toBeNull();
  });

  it('전체 동의는 모두 켜고, 다시 누르면 모두 끈다', () => {
    const on = toggleAll(EMPTY_AGREEMENTS);
    expect(Object.values(on).every(Boolean)).toBe(true);
    expect(toAgreementsInput(on)).toMatchObject({ interest_alert: true, marketing: true });
    expect(toggleAll(on)).toEqual(EMPTY_AGREEMENTS);
  });

  it('일부만 켜져 있을 때 전체 동의를 누르면 모두 켠다', () => {
    expect(Object.values(toggleAll({ ...EMPTY_AGREEMENTS, service: true })).every(Boolean)).toBe(
      true,
    );
  });
});

describe('문구 안의 시각·기간', () => {
  it('기간', () => {
    expect(formatMonthsLabel(24)).toBe('2년');
    expect(formatMonthsLabel(6)).toBe('6개월');
  });

  it('관심 동네·찜한 샵 알림 설명에 정책값 시각이 들어간다(오후 1시, 밤 9시~아침 8시, 2년)', () => {
    const text = AGREEMENT_ITEMS.find((item) => item.key === 'interest_alert')?.description?.join(
      ' ',
    );
    expect(text).toContain('오후 1시');
    expect(text).toContain('밤 9시부터 아침 8시까지');
    expect(text).toContain('2년마다');
    expect(text).toContain('받는 정보: 관심 동네와 찜한 샵의 새 할인 매물 소식(광고성 정보)');
  });

  it('이벤트·혜택 동의 설명은 무엇을 보내는지 따로 알린다', () => {
    const text = AGREEMENT_ITEMS.find((item) => item.key === 'marketing')?.description?.join(' ');
    expect(text).toContain('받는 정보: 할인 이벤트, 쿠폰 같은 혜택 소식');
    expect(text).toContain('밤 9시부터 아침 8시까지');
    expect(text).toContain('2년마다');
  });
});
