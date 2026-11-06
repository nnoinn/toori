// 예약번호 (C-405, #17 Q10, #262). 숫자 12자리이고 맨 앞 0도 된다. 저장은 하이픈 없이 숫자만 한다.
// 화면은 4자리씩 끊어 보여 주고(공통 UI ReservationCode), 원장님은 끝 4자리로 방문을 확인한다(11/6 nnoinn).
// 겹치면 reservations.code unique가 막으므로, 저장할 때 겹침 오류가 나면 새로 만들어 다시 넣는다(confirm-store.ts).

import 'server-only';

import { randomInt } from 'node:crypto';

const LENGTH = 12;
/** 원장님이 방문을 확인할 때 보는 끝자리 수 */
export const RESERVATION_CODE_TAIL_LENGTH = 4;

export const RESERVATION_CODE_PATTERN = /^\d{12}$/;

export function newReservationCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += String(randomInt(10));
  return code;
}

/** 원장님이 방문 확인에 쓰는 끝 4자리 */
export function reservationCodeTail(code: string): string {
  return code.slice(-RESERVATION_CODE_TAIL_LENGTH);
}
