// 예약번호 (C-405, #17 Q10). 영문 대문자+숫자 8자리, 헷갈리는 0/O·1/I는 쓰지 않는다. DB 고유 ID와 따로 둔다.
// 겹치면 reservations.code unique가 막으므로, 저장할 때 겹침 오류가 나면 새로 만들어 다시 넣는다(W11).

import 'server-only';

import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

export const RESERVATION_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export function newReservationCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
