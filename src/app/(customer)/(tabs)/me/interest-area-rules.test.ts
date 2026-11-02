import { describe, expect, it } from 'vitest';

import { REGIONS } from '@/features/map/regions';

import { INTEREST_AREA_NOTE, toggleInterestArea } from './interest-area-rules';

const [first, second] = REGIONS.map((region) => region.code);

describe('관심 동네 고르기 (J14, C-601)', () => {
  it('누르면 켜고 다시 누르면 끈다', () => {
    expect(toggleInterestArea([], first)).toEqual([first]);
    expect(toggleInterestArea([first], first)).toEqual([]);
  });

  it('누른 순서와 상관없이 동네 목록 순서로 둔다', () => {
    expect(toggleInterestArea([second], first)).toEqual([first, second]);
    expect(toggleInterestArea([first, second], second)).toEqual([first]);
  });

  it('알림 시각은 정책값으로 쓴다(오후 1시, 밤 9시~아침 8시)', () => {
    expect(INTEREST_AREA_NOTE).toContain('하루 한 번 오후 1시');
    expect(INTEREST_AREA_NOTE).toContain('밤 9시부터 아침 8시까지는 보내지 않아요');
  });
});
