// [내 예약] 카드의 끝 시각 글자(#359 2번). 화면과 서버 어디서나 쓴다. 시각은 서버가 준 ISO 문자열을 한국 시간으로 보여준다.
// 자정에 끝나면 "24:00", 새벽까지 이어지면 "다음 날 01:00"이다. 영업시간 규칙(기술 가이드 7장 "영업시간", 11/11)은
// 닫는 시각 00:00을 자정 마감, 닫는 시각이 더 이르면 다음 날 새벽까지로 본다. "24:00" 표기는 정찬형 제안이고 nnoinn 확인 중이다(#364).
// 시간대 매물 상세(#357)의 끝 시각과 같은 규칙이라, 두 PR이 머지되면 한 곳으로 합친다

import { formatKstTime, kstDateKey } from '@/lib/time';

/** 끝 시각. 시작과 같은 날이면 "16:00", 다음 날 0시 정각이면 "24:00", 그 밖에 날이 넘어가면 "다음 날 01:00" */
export function reservationEndText(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const time = formatKstTime(end);
  if (kstDateKey(start) === kstDateKey(end)) return time;
  return time === '00:00' ? '24:00' : `다음 날 ${time}`;
}
