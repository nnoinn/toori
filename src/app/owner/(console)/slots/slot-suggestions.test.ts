// 매물 등록 "이번 주 권하는 매물"(S-411)의 버튼: 지금 고를 수 있는 권유만, 시작 시각(한국 시간)과 글자,
// 눌린 버튼, 방금 올린 권유 찾기

import { describe, expect, it } from 'vitest';

import type { SuggestedSlot } from '@/features/weekly-suggest/weekly-suggest';

import {
  isSameSuggestion,
  postedSuggestion,
  suggestedStartAt,
  suggestionLabel,
  toSuggestionChips,
} from './slot-suggestions';

const at = (date: string, hm: string) => new Date(`${date}T${hm}:00+09:00`);
const MONDAY_10AM = at('2026-11-30', '10:00');

const item = (date: string, startTime: string, extra: Partial<SuggestedSlot> = {}) => ({
  date,
  startTime,
  menuId: 'cut',
  discountRate: 30 as const,
  newCustomerOnly: false,
  ...extra,
});

describe('주간 권유 버튼: 시작 시각 (S-411)', () => {
  it('권유 날짜·시각은 한국 시간이다(자정 넘은 새벽도 그 날짜)', () => {
    expect(suggestedStartAt(item('2026-12-01', '14:00'))).toEqual(at('2026-12-01', '14:00'));
    expect(suggestedStartAt(item('2026-12-02', '00:30'))).toEqual(new Date('2026-12-01T15:30:00Z'));
  });
});

describe('주간 권유 버튼: 고를 수 있는 권유만 (S-411)', () => {
  it('받은 순서 그대로 시작 시각을 계산해 둔다', () => {
    expect(
      toSuggestionChips(
        [item('2026-12-01', '14:00'), item('2026-12-05', '11:00', { menuId: 'perm' })],
        ['cut', 'perm'],
        MONDAY_10AM,
      ),
    ).toEqual([
      { ...item('2026-12-01', '14:00'), startIso: at('2026-12-01', '14:00').toISOString() },
      {
        ...item('2026-12-05', '11:00', { menuId: 'perm' }),
        startIso: at('2026-12-05', '11:00').toISOString(),
      },
    ]);
  });

  it('그사이 숨긴 메뉴, 이미 지난 시각, 14일 밖은 뺀다', () => {
    const chips = toSuggestionChips(
      [
        item('2026-11-30', '09:00'), // 지난 시각
        item('2026-11-30', '10:00'), // 지금과 같은 시각도 지났다
        item('2026-12-01', '14:00', { menuId: 'hidden' }),
        item('2026-12-20', '14:00'), // 14일 밖
        item('2026-12-03', '16:00'),
      ],
      ['cut'],
      MONDAY_10AM,
    );
    expect(chips.map((chip) => `${chip.date} ${chip.startTime}`)).toEqual(['2026-12-03 16:00']);
  });

  it('고를 권유가 없으면 빈 목록', () => {
    expect(toSuggestionChips([], ['cut'], MONDAY_10AM)).toEqual([]);
  });
});

describe('주간 권유 버튼: 글자와 눌린 버튼 (S-411)', () => {
  const [chip, newOnly] = toSuggestionChips(
    [item('2026-12-01', '14:00'), item('2026-12-05', '11:00', { newCustomerOnly: true })],
    ['cut'],
    MONDAY_10AM,
  );

  it('날짜(요일)·시각, 메뉴 이름, 할인율, 신규 고객 전용', () => {
    expect(suggestionLabel(chip, '여성 커트')).toBe('12/1(화) 14:00 · 여성 커트 · 30%');
    expect(suggestionLabel(newOnly, '여성 커트')).toBe(
      '12/5(토) 11:00 · 여성 커트 · 30% · 신규 고객 전용',
    );
  });

  it('메뉴·시작 시각·할인율·신규 고객 전용이 모두 같아야 눌린 버튼', () => {
    const chosen = {
      menuId: 'cut',
      startIso: chip.startIso,
      discountRate: 30 as const,
      newCustomerOnly: false,
    };
    expect(isSameSuggestion(chip, chosen)).toBe(true);
    expect(isSameSuggestion(chip, { ...chosen, discountRate: 40 })).toBe(false);
    expect(isSameSuggestion(chip, { ...chosen, newCustomerOnly: true })).toBe(false);
    expect(isSameSuggestion(chip, { ...chosen, startIso: newOnly.startIso })).toBe(false);
    expect(isSameSuggestion(chip, { ...chosen, menuId: null })).toBe(false);
  });

  it('방금 올린 매물과 메뉴·시작 시각이 같은 권유를 올린 것으로 본다(할인율을 바꿔 올려도)', () => {
    expect(postedSuggestion([chip, newOnly], { menuId: 'cut', startIso: newOnly.startIso })).toBe(
      newOnly,
    );
    expect(
      postedSuggestion([chip, newOnly], {
        menuId: 'cut',
        startIso: at('2026-12-01', '15:00').toISOString(),
      }),
    ).toBeNull();
    expect(postedSuggestion([chip], { menuId: 'perm', startIso: chip.startIso })).toBeNull();
  });
});
