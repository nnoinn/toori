import { describe, expect, it } from 'vitest';

import {
  AGREEMENT_ITEMS,
  allRequiredChecked,
  EMPTY_AGREEMENTS,
  toAgreementsInput,
  toggleAll,
} from './agreements';

describe('고객 약관 동의', () => {
  it('필수 3개(이용약관·개인정보·위치정보), 선택 1개(광고성 정보)', () => {
    expect(AGREEMENT_ITEMS.filter((item) => item.required).map((item) => item.key)).toEqual([
      'service',
      'privacy',
      'location',
    ]);
    expect(AGREEMENT_ITEMS.find((item) => item.key === 'marketing')?.required).toBe(false);
  });

  it('처음에는 모두 해제라 다음으로 갈 수 없다', () => {
    expect(allRequiredChecked(EMPTY_AGREEMENTS)).toBe(false);
    expect(toAgreementsInput(EMPTY_AGREEMENTS)).toBeNull();
  });

  it('필수만 체크하면 갈 수 있고 광고성 동의는 false로 넘긴다', () => {
    const state = { ...EMPTY_AGREEMENTS, service: true, privacy: true, location: true };
    expect(toAgreementsInput(state)).toEqual({
      service: true,
      privacy: true,
      location: true,
      marketing: false,
    });
  });

  it('필수가 하나라도 빠지면 갈 수 없다', () => {
    const state = { ...EMPTY_AGREEMENTS, service: true, privacy: true, marketing: true };
    expect(toAgreementsInput(state)).toBeNull();
  });

  it('전체 동의는 모두 켜고, 다시 누르면 모두 끈다', () => {
    const on = toggleAll(EMPTY_AGREEMENTS);
    expect(Object.values(on).every(Boolean)).toBe(true);
    expect(toAgreementsInput(on)?.marketing).toBe(true);
    expect(toggleAll(on)).toEqual(EMPTY_AGREEMENTS);
  });

  it('일부만 켜져 있을 때 전체 동의를 누르면 모두 켠다', () => {
    const some = { ...EMPTY_AGREEMENTS, service: true };
    expect(Object.values(toggleAll(some)).every(Boolean)).toBe(true);
  });
});
