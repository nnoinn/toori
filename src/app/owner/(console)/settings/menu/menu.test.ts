import { describe, expect, it } from 'vitest';

import { MENU_DURATION_STEP_MINUTES } from '@/server/policy';

import { MENU_DURATION_OPTIONS, type MenuInput, validateMenu } from './menu';

const valid = (overrides: Partial<MenuInput> = {}): MenuInput => ({
  serviceType: 'cut',
  name: '  디자인 커트  ',
  listPrice: '33,500',
  durationMinutes: 60,
  description: '샴푸 포함',
  ...overrides,
});

describe('MENU_DURATION_OPTIONS', () => {
  it('매물 시작 시각 간격 단위로 8시간까지', () => {
    expect(MENU_DURATION_OPTIONS[0]).toBe(MENU_DURATION_STEP_MINUTES);
    expect(MENU_DURATION_OPTIONS.at(-1)).toBe(480);
    expect(
      MENU_DURATION_OPTIONS.every((minutes) => minutes % MENU_DURATION_STEP_MINUTES === 0),
    ).toBe(true);
  });
});

describe('validateMenu', () => {
  it('공백·쉼표를 정리하고, 빈 설명은 null로 저장한다', () => {
    expect(validateMenu('hair', valid({ description: ' ' }))).toEqual({
      ok: true,
      data: {
        serviceType: 'cut',
        name: '디자인 커트',
        listPrice: 33500,
        durationMinutes: 60,
        description: null,
      },
    });
  });

  it('지금 업종에 없는 서비스 종류는 막는다', () => {
    const result = validateMenu('nail_lash', valid());
    expect(!result.ok && result.fieldErrors.serviceType).toBe('서비스 종류를 골라 주세요');
  });

  it.each(['1000', '1,000,000', '23450'])('정가 %s원은 통과한다', (listPrice) => {
    expect(validateMenu('hair', valid({ listPrice })).ok).toBe(true);
  });

  it.each([
    ['990', '정가는 1,000원부터 1,000,000원까지 입력해 주세요'],
    ['1000010', '정가는 1,000원부터 1,000,000원까지 입력해 주세요'],
    ['', '정가는 1,000원부터 1,000,000원까지 입력해 주세요'],
    ['12,3a0', '정가는 1,000원부터 1,000,000원까지 입력해 주세요'],
    ['-5000', '정가는 1,000원부터 1,000,000원까지 입력해 주세요'],
    ['33505', '정가는 10원 단위로 입력해 주세요'],
  ])('정가 "%s"는 막는다', (listPrice, message) => {
    const result = validateMenu('hair', valid({ listPrice }));
    expect(!result.ok && result.fieldErrors.listPrice).toBe(message);
  });

  it.each([0, MENU_DURATION_STEP_MINUTES + 5, 490])(
    '소요 시간 %i분은 막는다',
    (durationMinutes) => {
      const result = validateMenu('hair', valid({ durationMinutes }));
      expect(!result.ok && result.fieldErrors.durationMinutes).toBe('소요 시간을 골라 주세요');
    },
  );

  it('빈 이름, 너무 긴 이름·설명은 칸마다 알려 준다', () => {
    expect(validateMenu('hair', valid({ name: ' ', description: 'a'.repeat(501) }))).toEqual({
      ok: false,
      fieldErrors: {
        name: '서비스 이름을 입력해 주세요',
        description: '상세 설명은 500자까지 쓸 수 있어요',
      },
    });
    const long = validateMenu('hair', valid({ name: '가'.repeat(41) }));
    expect(!long.ok && long.fieldErrors.name).toBe('서비스 이름은 40자까지 쓸 수 있어요');
  });

  it('모양이 틀린 입력은 저장하지 않는다', () => {
    expect(validateMenu('hair', { name: 1 }).ok).toBe(false);
  });
});
