// 시간대 매물(#308)의 시각 범위 글자. 목록 카드와 시간대 상세가 같이 쓴다. 화면과 서버 어디서나 쓴다.
// 시각은 서버가 준 ISO 문자열을 한국 시간으로 보여준다. 끝 시각은 공통 함수 formatEndTime(다음 날이면 "02:00(익일)", 11/13 nnoinn)

import { formatEndTime, formatKst } from '@/lib/time';
import type { WindowStart } from '@/server/slot-windows';

/** 시간대 범위. 예: "11/14(토) 14:00 ~ 18:00", "11/14(토) 22:00 ~ 02:00(익일)" */
export function windowRangeText(startAt: string, endAt: string): string {
  return `${formatKst(new Date(startAt))} ~ ${formatEndTime(startAt, endAt)}`;
}

/** 시작 시각 고르기 버튼의 끝 시각. 예: "~ 15:00", "~ 00:00(익일)" */
export function startEndText(start: WindowStart): string {
  return `~ ${formatEndTime(start.startAt, start.endAt)}`;
}
