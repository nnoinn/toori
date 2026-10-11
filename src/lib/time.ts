// 시간 계산 공용 함수.
// DB에는 UTC로 저장하고, 화면에는 한국 시간(KST, UTC+9)으로 보여준다.
// 한국은 서머타임이 없어서 항상 UTC+9로 계산한다.
// "지금"은 폰 시계가 틀릴 수 있으니 서버에서 받은 시각을 now로 넘긴다.

export const KST_TIME_ZONE = 'Asia/Seoul';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 한국 시간 기준 날짜와 시각. month는 1~12, weekday는 0(일)~6(토) */
export type KstDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** 한국 시간으로 고른 날짜·시각을 DB에 저장할 UTC Date로 바꾼다 */
export function kstToUtc({ year, month, day, hour, minute }: KstDateTime): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS);
}

/** UTC Date를 한국 시간 날짜·시각으로 바꾼다 */
export function utcToKst(date: Date): KstDateTime & { weekday: number } {
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    weekday: kst.getUTCDay(),
  };
}

/** 화면 표시용 한국 시간. 예: "10/12(월) 15:00" */
export function formatKst(date: Date): string {
  const t = utcToKst(date);
  return `${t.month}/${t.day}(${WEEKDAYS[t.weekday]}) ${pad2(t.hour)}:${pad2(t.minute)}`;
}

/** target까지 남은 시간(밀리초). 이미 지났으면 음수 */
export function msUntil(target: Date, now: Date): number {
  return target.getTime() - now.getTime();
}

/** target까지 남은 시간(시간 단위, 소수 포함). 위약금 구간·임박·게시 가능 판단에 쓴다 */
export function hoursUntil(target: Date, now: Date): number {
  return msUntil(target, now) / HOUR_MS;
}

/** target까지 남은 시간(분 단위, 소수 포함). 리마인드·홀딩 타이머에 쓴다 */
export function minutesUntil(target: Date, now: Date): number {
  return msUntil(target, now) / MINUTE_MS;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR_MS);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
