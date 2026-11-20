// 대시보드 "이번 달 투리" 카드(S-504 월별 통계) 계산과 문구. 화면과 서버 어디서나 가져올 수 있다.
// - 살린 시간: 이번 달에 방문 완료로 처리한 예약의 시술 시간(매물 시작~끝) 합. 노쇼·취소·무효는 빈 시간을 채운 게 아니라서 뺀다(11/20 정민석)
// - 추가 수입: 정산 내역(getSettlementItems)의 이번 달 정산액 합. 수수료를 뗀 뒤, 원장님 사정 취소 패널티는 떼기 전이라
//   정산 화면 "이 기간 합계"의 정산액과 같다. 결제 수수료율이 정해지기 전에는 [미정](11/20 정민석)
// - "이번 달"은 정산 내역과 같이 방문·노쇼 처리일이나 취소일(한국 날짜)이다

import { formatDuration, formatWon } from '@/lib/format';
import { kstToUtc } from '@/lib/time';

import { shiftMonth, UNKNOWN_FEE_NOTE, wonOrUnknown } from '../settlements/settlement-format';

/** 방문 완료 예약 수와 시술 시간 합(분) */
export type MonthVisitTime = { visitCount: number; minutes: number };

/** 이번 달 정산 내역 합계 중 카드에 쓰는 것(거래 수, 정산액 합, 아직 떼지 못한 패널티). 못 읽으면 null */
export type MonthPayout = {
  count: number;
  payoutAmount: number | null;
  outstandingPenalty: number;
} | null;

/** 달 'YYYY-MM'의 한국 시간 1일 0시부터 다음 달 1일 0시 전까지 */
export function kstMonthBounds(month: string): { from: Date; to: Date } {
  const firstDay = (key: string) => {
    const [year, monthNumber] = key.split('-').map(Number);
    return kstToUtc({ year, month: monthNumber, day: 1, hour: 0, minute: 0 });
  };
  return { from: firstDay(month), to: firstDay(shiftMonth(month, 1)) };
}

/** 살린 시간. 예: "5시간 30분". 없으면 "0분" */
export function savedTimeText(minutes: number): string {
  return minutes > 0 ? formatDuration(minutes) : '0분';
}

/** 추가 수입. 예: "137,900원", 결제 수수료율이 정해지기 전에는 "[미정]", 못 읽으면 "-" */
export function monthPayoutText(payout: MonthPayout): string {
  return payout ? wonOrUnknown(payout.payoutAmount) : '-';
}

/** 추가 수입 아래 작은 글씨. 거래 수, 또는 못 읽었다는 안내 */
export function monthPayoutCaption(payout: MonthPayout): string {
  return payout ? `수수료를 뗀 정산액 · 거래 ${payout.count}건` : '정산 내역을 불러오지 못했어요';
}

/**
 * 카드 아래 안내. 결제 수수료율이 정해지기 전이라 [미정]이면 그 이유,
 * 아직 떼지 못한 원장님 사정 취소 패널티가 있으면 이 금액은 패널티를 떼기 전이라는 것
 */
export function monthSummaryNotes(payout: MonthPayout): string[] {
  if (!payout) return [];
  const notes: string[] = [];
  if (payout.payoutAmount === null) notes.push(UNKNOWN_FEE_NOTE);
  if (payout.outstandingPenalty > 0) {
    notes.push(`남은 패널티(${formatWon(payout.outstandingPenalty)})를 떼기 전 금액이에요.`);
  }
  return notes;
}
