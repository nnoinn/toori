import { describe, expect, it } from 'vitest';

import { serverNowAt } from './hold-bar-rules';

// 기댓값 출처: #566(11/23 nnoinn) — 폰 알약을 누르면 뜨는 창에 남은 시간을 보여 준다.
// 타이머는 서버 시각 기준(C-404 "서버 시각 기준 10분 타이머")이라 창을 늦게 열어도 알약과 같은 남은 시간이어야 한다
describe('폰 알약 창의 남은 시간(#566)', () => {
  it('홀딩을 받고 2분 30초 뒤에 창을 열면 서버 시각도 2분 30초 뒤', () => {
    const receivedAt = 1_700_000_000_000;
    expect(serverNowAt('2026-11-24T05:00:00.000Z', receivedAt, receivedAt + 150_000)).toBe(
      '2026-11-24T05:02:30.000Z',
    );
  });

  it('받자마자 열면 받은 서버 시각 그대로(이 기기 시계가 서버와 달라도)', () => {
    // 이 기기 시계는 서버보다 한참 늦다(2023년). 흐른 시간만 더하므로 상관없다
    const receivedAt = 1_700_000_000_000;
    expect(serverNowAt('2026-11-24T05:00:00.000Z', receivedAt, receivedAt)).toBe(
      '2026-11-24T05:00:00.000Z',
    );
  });
});
