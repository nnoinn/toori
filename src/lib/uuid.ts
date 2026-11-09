// id 모양 확인. 화면·서버 어디서나 쓴다.
// 주소나 서버 함수로 들어온 id가 uuid 모양이 아니면 DB에 묻지 않고 "없음"으로 본다. 모양이 틀린 id가 DB까지 가면 "찾을 수 없어요" 대신 DB 오류가 난다.

import { z } from 'zod';

const uuidSchema = z.uuid();

/** uuid 모양이면 true */
export function isUuid(value: unknown): value is string {
  return uuidSchema.safeParse(value).success;
}
