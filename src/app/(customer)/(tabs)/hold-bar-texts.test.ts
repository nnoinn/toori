import { describe, expect, it } from 'vitest';

import {
  HOLD_BAR_LABEL,
  HOLD_RELEASE_CONFIRM,
  holdBarStartText,
  holdBarTitle,
} from './hold-bar-texts';

// 기댓값 출처: #359 1번(11/12 점검 5-1) — 막대에 매물(샵·서비스·시작 시각)과 남은 시간, [취소] 전에 한 번 묻는다.
// 확인 창 문구는 11/14 정찬형 승인
describe('결제 중 매물 막대 문구', () => {
  it('샵 이름과 메뉴 이름을 같이 보여준다', () => {
    expect(holdBarTitle({ shopName: '안산 헤어', menuName: '여성 커트' })).toBe(
      '안산 헤어 · 여성 커트',
    );
  });

  it('시작 시각은 한국 시각과 요일로 보여준다', () => {
    // 2026-11-14(토) 14:00 KST
    expect(holdBarStartText('2026-11-14T05:00:00.000Z')).toBe('11/14(토) 14:00 시작');
    // 자정 넘어 KST로 날짜가 바뀌는 시각(UTC로는 전날)
    expect(holdBarStartText('2026-11-14T15:30:00.000Z')).toBe('11/15(일) 00:30 시작');
  });

  it('막대 이름과 [취소] 확인 창 문구', () => {
    expect(HOLD_BAR_LABEL).toBe('결제 중인 매물');
    expect(HOLD_RELEASE_CONFIRM).toEqual({
      title: '결제를 그만둘까요?',
      description: '이 매물을 다른 고객이 예약할 수 있게 돼요.',
      keep: '계속 결제하기',
      release: '그만두기',
    });
  });
});
