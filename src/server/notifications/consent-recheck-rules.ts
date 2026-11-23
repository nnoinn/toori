// 2년마다 광고성 정보 수신 동의 확인 (#535, 동의 문구 6-2장, 정보통신망법). 계산과 문구만 한다(DB 없음).
// 동의한 날부터 MARKETING_CONSENT_RECHECK_MONTHS(24개월)마다 알린다. 날은 한국 날짜로 센다:
// 동의한 날짜와 같은 날짜가 되면 그날 알린다(오후 1시 작업이 그날 동의한 시각보다 일러도 그날). 그 달에 같은 날짜가 없으면
// 그 달 마지막 날이다(2/29 동의 → 2월 28일).
// 확인 날부터 RECHECK_SEND_DAYS(30일) 안에만 보낸다. 알림함이 90일 지난 알림을 지우면(#371) 같은 값으로 한 번만 보내는 기록(dedupe_key)도
// 사라져서, 기한 없이 보내면 90일 뒤부터 매일 다시 가기 때문이다. 예약 작업이 30일 넘게 멈추면 그 차례는 건너뛴다

import { SITE_NAME } from '@/lib/site';
import { kstToUtc, utcToKst } from '@/lib/time';
import { OPTIONAL_CONSENT_NAMES, type OptionalConsentType } from '@/server/policy/terms';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 확인 날부터 며칠 안에 보내는지. 알림함 보관 기간(NOTIFICATION_INBOX_DAYS, 90일)보다 짧아야 한다 */
export const RECHECK_SEND_DAYS = 30;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 지금이 동의한 날부터 몇 번째 확인 차례인지(1 = 2년, 2 = 4년 …). 아직 첫 차례 전이면 0.
 * 한국 날짜로 꽉 찬 달 수를 세고, 그 달에 동의한 날짜가 없으면 마지막 날을 같은 날짜로 본다
 */
export function consentRecheckRound(agreedAt: Date, now: Date, everyMonths: number): number {
  const agreed = utcToKst(agreedAt);
  const today = utcToKst(now);
  let months = (today.year - agreed.year) * 12 + (today.month - agreed.month);
  const sameDay = Math.min(agreed.day, daysInMonth(today.year, today.month));
  if (today.day < sameDay) months -= 1;
  return months < 0 ? 0 : Math.floor(months / everyMonths);
}

/** round번째 확인 날(한국 날짜 0시). 그 달에 동의한 날짜가 없으면 마지막 날 */
export function consentRecheckDay(agreedAt: Date, round: number, everyMonths: number): Date {
  const agreed = utcToKst(agreedAt);
  const index = agreed.year * 12 + (agreed.month - 1) + round * everyMonths;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(agreed.day, daysInMonth(year, month));
  return kstToUtc({ year, month, day, hour: 0, minute: 0 });
}

/** 지금 보낼 차례. 확인 날이 됐고 그날부터 RECHECK_SEND_DAYS 안이면 그 차례, 아니면 null */
export function dueRecheckRound(agreedAt: Date, now: Date, everyMonths: number): number | null {
  const round = consentRecheckRound(agreedAt, now, everyMonths);
  if (round < 1) return null;
  const day = consentRecheckDay(agreedAt, round, everyMonths);
  return now.getTime() - day.getTime() < RECHECK_SEND_DAYS * DAY_MS ? round : null;
}

/** DB에서 미리 거를 기준: 이 시각 전에 동의한 것만 확인 차례가 될 수 있다(며칠 넉넉히 둔다. 정확한 판단은 dueRecheckRound) */
export function recheckAgreedBefore(now: Date, everyMonths: number): Date {
  const shifted = new Date(now);
  shifted.setUTCMonth(shifted.getUTCMonth() - everyMonths);
  return new Date(shifted.getTime() + 4 * DAY_MS);
}

/** 같은 동의의 같은 차례에는 한 번만 보낸다(notify의 dedupeKey) */
export function consentRecheckKey(agreementId: string, round: number): string {
  return `consent.recheck:${agreementId}:${round}`;
}

/** 한국 날짜 "2026년 11월 23일" */
function formatKstDate(date: Date): string {
  const t = utcToKst(date);
  return `${t.year}년 ${t.month}월 ${t.day}일`;
}

/**
 * 알림 제목과 내용. 내용은 동의 문구 6-2장 그대로다(보내는 곳·동의한 날짜·동의한 사실·끄는 방법).
 * 예: "투리 · 2024년 11월 23일에 이벤트·혜택 소식(광고성 정보) 수신에 동의하셨어요. 계속 받으시려면 …"
 */
export function consentRecheckText(
  type: OptionalConsentType,
  agreedAt: Date,
): { title: string; body: string } {
  const name = OPTIONAL_CONSENT_NAMES[type];
  return {
    title: `${name} 수신 동의 확인`,
    body: `${SITE_NAME} · ${formatKstDate(agreedAt)}에 ${name}(광고성 정보) 수신에 동의하셨어요. 계속 받으시려면 하실 일이 없어요. 그만 받으려면 내 정보 > 알림 설정에서 끌 수 있어요.`,
  };
}
