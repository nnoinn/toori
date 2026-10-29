// 매물 목록 이어 불러오기 커서 (J4, D8: 커서 방식 20개씩).
// "마지막으로 본 매물의 정렬 값 + 매물 ID"를 담아, 다음 조회는 그 뒤부터 가져온다(keyset).
// 같은 정렬 값이 여러 개여도 매물 ID로 순서를 확정해서 빠지거나 겹치지 않는다.
// 브라우저가 들고 다니는 값이라 서버는 읽을 때 모양을 다시 확인한다. 만들고 읽는 일은 서버에서만 한다(Buffer).

import { z } from 'zod';

import type { SlotSort } from './sort';

/** 한 번에 불러오는 매물 수(D8) */
export const SLOT_PAGE_SIZE = 20;

export type SlotCursor = {
  sort: SlotSort;
  /** 마지막 매물의 정렬 값. near: 거리(m), discount: 할인율(%), imminent: 시작 시각(ISO) */
  value: number | string;
  /** 마지막 매물 ID(같은 정렬 값끼리 순서) */
  id: string;
};

// 정렬을 더하면 여기에도 그 정렬의 모양을 더한다
const cursorSchema = z.discriminatedUnion('sort', [
  z.object({ sort: z.literal('near'), value: z.number().finite().min(0), id: z.uuid() }),
  z.object({ sort: z.literal('discount'), value: z.number().int().min(0).max(100), id: z.uuid() }),
  z.object({ sort: z.literal('imminent'), value: z.iso.datetime({ offset: true }), id: z.uuid() }),
]);

export function encodeCursor(cursor: SlotCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/** 커서를 읽는다. 모양이 이상하거나 지금 정렬과 다르면 null(처음부터 불러온다) */
export function decodeCursor(raw: string | null | undefined, sort: SlotSort): SlotCursor | null {
  if (!raw || raw.length > 512) return null;
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    if (!parsed.success || parsed.data.sort !== sort) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
