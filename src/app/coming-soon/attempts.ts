// 팀 접속 코드를 여러 번 틀리면 잠시 막는다(#303).
// 서버 한 대(인스턴스)의 메모리에만 세는 간단한 장치라 서버가 여러 대로 늘면 대마다 따로 세고, 서버가 다시 뜨면 처음부터 센다.
// 그래도 한 곳에서 코드를 마구 넣어 보는 것은 늦춘다. 가장 중요한 막음은 코드를 단어 3~4개처럼 길게 정하는 것이다.

/** 이 시간 동안 이 횟수만큼 틀리면, 처음 틀린 때부터 이 시간이 지날 때까지 막는다 */
export const MAX_WRONG_ATTEMPTS = 10;
export const WRONG_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

// 기록이 이만큼 쌓이면 지난 기록을 지운다(메모리가 계속 늘지 않게)
const PRUNE_AT = 1000;

type Entry = { count: number; firstAt: number };

export type AttemptLimiter = {
  /** 막혀 있으면 풀릴 때까지 남은 밀리초, 아니면 0 */
  blockedFor(key: string, now: number): number;
  recordWrong(key: string, now: number): void;
  reset(key: string): void;
};

export function createAttemptLimiter({
  max = MAX_WRONG_ATTEMPTS,
  windowMs = WRONG_ATTEMPT_WINDOW_MS,
}: { max?: number; windowMs?: number } = {}): AttemptLimiter {
  const entries = new Map<string, Entry>();

  function current(key: string, now: number): Entry | null {
    const entry = entries.get(key);
    if (!entry) return null;
    if (now - entry.firstAt >= windowMs) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  return {
    blockedFor(key, now) {
      const entry = current(key, now);
      return entry && entry.count >= max ? entry.firstAt + windowMs - now : 0;
    },
    recordWrong(key, now) {
      if (entries.size >= PRUNE_AT) {
        for (const [k, e] of entries) if (now - e.firstAt >= windowMs) entries.delete(k);
      }
      const entry = current(key, now);
      if (entry) entry.count += 1;
      else entries.set(key, { count: 1, firstAt: now });
    },
    reset(key) {
      entries.delete(key);
    },
  };
}
