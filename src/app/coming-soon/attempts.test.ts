// 팀 접속 코드를 여러 번 틀리면 잠시 막기(#303)

import { describe, expect, it } from 'vitest';

import { createAttemptLimiter } from './attempts';

const MINUTE = 60 * 1000;

describe('틀린 코드 막기', () => {
  it('정한 횟수만큼 틀리기 전에는 막지 않는다', () => {
    const limiter = createAttemptLimiter({ max: 3, windowMs: 10 * MINUTE });
    limiter.recordWrong('ip-a', 0);
    limiter.recordWrong('ip-a', MINUTE);
    expect(limiter.blockedFor('ip-a', MINUTE)).toBe(0);
  });

  it('정한 횟수만큼 틀리면 처음 틀린 때부터 정한 시간이 지날 때까지 막는다', () => {
    const limiter = createAttemptLimiter({ max: 3, windowMs: 10 * MINUTE });
    limiter.recordWrong('ip-a', 0);
    limiter.recordWrong('ip-a', MINUTE);
    limiter.recordWrong('ip-a', 2 * MINUTE);
    expect(limiter.blockedFor('ip-a', 2 * MINUTE)).toBe(8 * MINUTE);
    expect(limiter.blockedFor('ip-a', 10 * MINUTE - 1)).toBe(1);
    expect(limiter.blockedFor('ip-a', 10 * MINUTE)).toBe(0);
  });

  it('정한 시간이 지난 뒤 틀리면 처음부터 다시 센다', () => {
    const limiter = createAttemptLimiter({ max: 2, windowMs: 10 * MINUTE });
    limiter.recordWrong('ip-a', 0);
    limiter.recordWrong('ip-a', 10 * MINUTE);
    expect(limiter.blockedFor('ip-a', 10 * MINUTE)).toBe(0);
    limiter.recordWrong('ip-a', 11 * MINUTE);
    expect(limiter.blockedFor('ip-a', 11 * MINUTE)).toBe(9 * MINUTE);
  });

  it('곳(접속 주소)마다 따로 세고, 맞히면 그곳의 기록을 지운다', () => {
    const limiter = createAttemptLimiter({ max: 2, windowMs: 10 * MINUTE });
    limiter.recordWrong('ip-a', 0);
    limiter.recordWrong('ip-a', 0);
    expect(limiter.blockedFor('ip-a', 0)).toBeGreaterThan(0);
    expect(limiter.blockedFor('ip-b', 0)).toBe(0);
    limiter.reset('ip-a');
    expect(limiter.blockedFor('ip-a', 0)).toBe(0);
  });

  it('기록이 많이 쌓이면 지난 기록을 지워도 아직 막힌 곳은 그대로 막는다', () => {
    const limiter = createAttemptLimiter({ max: 2, windowMs: 10 * MINUTE });
    for (let i = 0; i < 1000; i += 1) limiter.recordWrong(`old-${i}`, 0);
    limiter.recordWrong('ip-a', 5 * MINUTE);
    limiter.recordWrong('ip-a', 5 * MINUTE);
    limiter.recordWrong('ip-b', 11 * MINUTE);
    expect(limiter.blockedFor('ip-a', 11 * MINUTE)).toBe(4 * MINUTE);
    expect(limiter.blockedFor('old-1', 11 * MINUTE)).toBe(0);
  });
});
