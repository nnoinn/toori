// 정산 지급일 (X-206, 11/9 결정, #353). 계산만 하는 함수라 화면과 서버 어디서나 가져올 수 있다.
//
// - 지급일은 매주 목요일이고, 공휴일이면 다음 영업일로 미룬다(한국 날짜)
// - 거래는 이의제기 접수 기한이 지급일 0시(한국 시간)까지 지났으면 그날 지급에 묶인다(#353 결정 3)
// 예(기술 가이드 7장 "정산 주기"): 일요일 15시 서비스 → 4일 뒤 목요일, 금요일 15시 → 6일 뒤 목요일, 수요일 18시 → 8일 뒤 목요일

import { kstDateKey, kstToUtc, utcToKst } from '@/lib/time';
import { isBusinessDay } from '@/server/policy/holidays';
import { SETTLEMENT_PAYOUT_WEEKDAY } from '@/server/policy/settlement';

// 한국은 서머타임이 없어서 하루는 늘 24시간이다
const DAY_MS = 24 * 60 * 60 * 1000;

/** 그 시각이 든 한국 날짜의 0시 */
function kstMidnight(date: Date): Date {
  const { year, month, day } = utcToKst(date);
  return kstToUtc({ year, month, day, hour: 0, minute: 0 });
}

/** 지급 요일(0시)이 영업일이 아니면 영업일이 될 때까지 하루씩 미룬 날의 0시 */
function toBusinessDay(midnight: Date): Date {
  let day = midnight;
  // 공휴일이 길게 이어져도 한 달 안에서 끝난다
  for (let i = 0; i < 31; i += 1) {
    if (isBusinessDay(day)) return day;
    day = new Date(day.getTime() + DAY_MS);
  }
  throw new RangeError(`영업일을 찾지 못했어요: ${kstDateKey(midnight)}`);
}

/**
 * readyAt(이의제기 접수 기한)이 지난 거래가 묶이는 가장 이른 지급일(한국 날짜 'YYYY-MM-DD').
 * 기한이 지급일 0시와 같아도 그날 지급이다(기한 시각부터는 접수할 수 없다)
 */
export function payoutDateFor(readyAt: Date): string {
  const midnight = kstMidnight(readyAt);
  const daysBack = (utcToKst(midnight).weekday - SETTLEMENT_PAYOUT_WEEKDAY + 7) % 7;
  // readyAt이 든 주의 지급 요일(그날이나 그 전)부터 본다. 지급 요일이 공휴일이면 미뤄진 지급일이 readyAt 뒤일 수 있어서다
  let payoutWeekday = new Date(midnight.getTime() - daysBack * DAY_MS);
  for (let week = 0; week < 3; week += 1) {
    const payoutDay = toBusinessDay(payoutWeekday);
    if (payoutDay.getTime() >= readyAt.getTime()) return kstDateKey(payoutDay);
    payoutWeekday = new Date(payoutWeekday.getTime() + 7 * DAY_MS);
  }
  throw new RangeError(`지급일을 찾지 못했어요: ${readyAt.toISOString()}`);
}
