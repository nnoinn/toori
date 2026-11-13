// 시간대 매물(#308)의 시각 범위 글자. 목록 카드와 시간대 상세가 같이 쓴다. 화면과 서버 어디서나 쓴다.
// 시각은 서버가 준 ISO 문자열을 한국 시간으로 보여준다.

import { formatKst, formatKstTime, kstDateKey } from '@/lib/time';
import type { WindowStart } from '@/server/slot-windows';

/**
 * 끝 시각. 시작과 같은 날이면 "18:00", 다음 날 0시 정각이면 "24:00"(자정까지),
 * 그 밖에 날이 넘어가면 "다음 날 02:00"(새벽까지 영업하는 샵, 영업시간 규칙 11/11)
 */
function endTimeText(startAt: Date, endAt: Date): string {
  if (kstDateKey(startAt) === kstDateKey(endAt)) return formatKstTime(endAt);
  const time = formatKstTime(endAt);
  return time === '00:00' ? '24:00' : `다음 날 ${time}`;
}

/** 시간대 범위. 예: "11/14(토) 14:00 ~ 18:00", "11/14(토) 22:00 ~ 다음 날 02:00" */
export function windowRangeText(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  return `${formatKst(start)} ~ ${endTimeText(start, new Date(endAt))}`;
}

/** 시작 시각 고르기 버튼의 끝 시각. 예: "~ 15:00", "~ 24:00" */
export function startEndText(start: WindowStart): string {
  return `~ ${endTimeText(new Date(start.startAt), new Date(start.endAt))}`;
}
