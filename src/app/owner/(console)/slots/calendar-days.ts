// 매물 등록 ② 날짜 달력 계산 (S-205). 한국 날짜 'YYYY-MM-DD' 문자열로만 다룬다. 화면('use client')과 테스트가 같이 쓴다.
// 날짜 문자열은 시간대가 없어서, 계산할 때만 UTC 0시로 바꿔 하루씩 더하고 뺀다(한국 시간 변환이 끼지 않게).

const DAY_MS = 86_400_000;

const toMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** 날짜에 일수를 더한다. 예: ('2026-11-30', 1) → '2026-12-01' */
export function addDaysToKey(key: string, days: number): string {
  return toKey(toMs(key) + days * DAY_MS);
}

/** 요일. 0 = 일요일 */
export function weekdayOfKey(key: string): number {
  return new Date(toMs(key)).getUTCDay();
}

/** 날짜의 연·월·일 숫자 */
export function partsOfKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/**
 * 달력에 놓을 주(일요일부터 토요일까지 7칸). 첫 날이 든 주의 일요일부터 마지막 날이 든 주의 토요일까지.
 * 고를 수 없는 앞뒤 날짜도 칸을 채워서, 요일 줄이 늘 맞는다
 */
export function calendarWeeks(firstKey: string, lastKey: string): string[][] {
  const start = addDaysToKey(firstKey, -weekdayOfKey(firstKey));
  const end = addDaysToKey(lastKey, 6 - weekdayOfKey(lastKey));
  const weeks: string[][] = [];
  // 'YYYY-MM-DD'는 글자 순서가 날짜 순서와 같다
  for (let sunday = start; sunday <= end; sunday = addDaysToKey(sunday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDaysToKey(sunday, index)));
  }
  return weeks;
}

/** 달력 위 달 이름. 예: "2026년 11월", 달이 바뀌면 "2026년 11월 ~ 12월", 해가 바뀌면 "2026년 12월 ~ 2027년 1월" */
export function monthRangeLabel(firstKey: string, lastKey: string): string {
  const first = partsOfKey(firstKey);
  const last = partsOfKey(lastKey);
  const head = `${first.year}년 ${first.month}월`;
  if (first.year === last.year && first.month === last.month) return head;
  return first.year === last.year
    ? `${head} ~ ${last.month}월`
    : `${head} ~ ${last.year}년 ${last.month}월`;
}
