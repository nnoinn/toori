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
  return `${t.month}/${t.day}(${WEEKDAYS[t.weekday]}) ${formatKstTime(date)}`;
}

/** 화면 표시용 한국 시각만. 예: "15:00". 끝 시각("10/12(월) 15:00 ~ 16:00")이나 시작 시각 고르기 버튼에 쓴다 */
export function formatKstTime(date: Date): string {
  const t = utcToKst(date);
  return `${pad2(t.hour)}:${pad2(t.minute)}`;
}

/** 다음 날을 나타내는 표시. 영업시간의 닫는 시각과 끝나는 시각에 같이 쓴다(11/12·11/13 nnoinn) */
export const NEXT_DAY_MARK = '(익일)';

/** 시각 글자 뒤에 다음 날 표시를 붙인다. 예: "02:00" → "02:00(익일)" */
export function withNextDayMark(time: string): string {
  return `${time}${NEXT_DAY_MARK}`;
}

/**
 * 끝나는 시각. 시작과 같은 날(한국 날짜)이면 "16:00", 다음 날이면 "00:00(익일)"·"01:00(익일)".
 * "24:00"·"다음 날 01:00"은 쓰지 않는다(11/13 nnoinn). 매물·시간대·예약 화면이 같이 쓴다. ISO 문자열도 받는다
 */
export function formatEndTime(startAt: Date | string, endAt: Date | string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const time = formatKstTime(end);
  return kstDateKey(start) === kstDateKey(end) ? time : withNextDayMark(time);
}

/**
 * 운영자 목록·계정 이력의 기록 시각. 예: "2026-11-02 18:22"(한국 시간, 연도 넣고 요일 뺌, 11/13 nnoinn).
 * 기록이 해를 넘겨 쌓이므로 연도를 꼭 넣는다. ISO 문자열도 받는다
 */
export function formatKstDateTime(date: Date | string): string {
  const value = new Date(date);
  return `${kstDateKey(value)} ${formatKstTime(value)}`;
}

/** target까지 남은 시간(밀리초). 이미 지났으면 음수 */
export function msUntil(target: Date, now: Date): number {
  return target.getTime() - now.getTime();
}

/** target까지 남은 시간(시간 단위, 소수 포함). 위약금 구간·임박·게시 가능 판단에 쓴다 */
export function hoursUntil(target: Date, now: Date): number {
  return msUntil(target, now) / HOUR_MS;
}

/** 한국 날짜를 'YYYY-MM-DD' 모양으로. 날짜 칸(date)과 비교하거나 날짜별로 묶을 때 쓴다 */
export function kstDateKey(date: Date): string {
  const { year, month, day } = utcToKst(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
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

/**
 * 하루 중 시각(0~23시)을 문구로. 예: 13 → "오후 1시", 21 → "밤 9시", 8 → "아침 8시".
 * 정책값 시각(관심 동네 알림 시각, 야간 미발송 시간)을 화면 문구에 넣을 때 쓴다(가입 약관, 내 정보 알림)
 */
export function formatHourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  if (hour >= 5 && hour < 12) return `아침 ${h12}시`;
  if (hour >= 12 && hour < 18) return `오후 ${h12}시`;
  if (hour >= 18 && hour < 21) return `저녁 ${h12}시`;
  return `밤 ${h12}시`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 한국 날짜로 오늘 0시(UTC Date). 예: 원장님 대시보드는 이보다 먼저 시작한 매물을 오늘·예정 탭에 넣지 않는다 */
export function startOfKstDay(now: Date): Date {
  const { year, month, day } = utcToKst(now);
  return kstToUtc({ year, month, day, hour: 0, minute: 0 });
}
