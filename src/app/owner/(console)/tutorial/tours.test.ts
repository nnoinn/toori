import { describe, expect, it } from 'vitest';

import { PUBLISH_WINDOW_HOURS } from '@/server/policy';

import { availableSteps, isTourKey, TOUR_KEYS, TOURS } from './tours';

// 원장님 튜토리얼 화면별 말풍선(S-412): 매물 등록·시간대 매물·예약 상세(부분 마감은 S-210 때)

describe('원장님 튜토리얼 말풍선 (S-412)', () => {
  it('화면은 매물 등록(한 시술·시간대)과 예약 상세다', () => {
    expect(TOUR_KEYS).toEqual(['slot_single', 'slot_window', 'reservation_detail']);
  });

  it('한 화면 안에서 말풍선이 붙는 칸은 겹치지 않는다', () => {
    for (const key of TOUR_KEYS) {
      const targets = TOURS[key].map((step) => step.target);
      expect(new Set(targets).size, key).toBe(targets.length);
    }
  });

  it('게시 시각 안내는 정책 값(게시 48시간 전, S-204)으로 쓴다', () => {
    const steps = TOURS.slot_single.find((step) => step.target === 'slot-steps');
    expect(steps?.body).toContain(`시작 ${PUBLISH_WINDOW_HOURS}시간 전부터`);
  });

  it('지금 화면에 보이는 칸만 순서를 지켜 남긴다', () => {
    const shown = new Set(['reservation-header', 'reservation-cancel', 'reservation-booker']);
    expect(
      availableSteps(TOURS.reservation_detail, (target) => shown.has(target)).map((s) => s.target),
    ).toEqual(['reservation-header', 'reservation-cancel', 'reservation-booker']);
    expect(availableSteps(TOURS.slot_window, () => false)).toEqual([]);
  });

  it('말풍선 이름인지', () => {
    expect(isTourKey('slot_single')).toBe(true);
    expect(isTourKey('partial_close')).toBe(false);
    expect(isTourKey(1)).toBe(false);
  });
});
