// 매물 상태 DB 조건 (X-301, X-302, 연결 #16). 서버에서만 쓴다. 화면 코드는 slot-status.ts를 쓴다.
// 입출력 약속은 Issue #57을 따른다. slot-status.ts의 getSlotStatus·isSlotOnHold와 늘 같은 답을 내야 한다.
// now는 DB의 now() 대신 서버에서 받은 시각을 넘긴다. 순수 함수와 같은 시각으로 비교하기 위해서다.
//
// 예: 고객 목록  and(slotStatusIs('published', now), ...)
//     홀딩(W10)  and(eq(slots.id, id), slotStatusIs('published', now), not(slotIsOnHold(now)))

import 'server-only';

import { and, eq, gt, inArray, isNotNull, lte, or, type SQL } from 'drizzle-orm';

import { slots } from '@/db/schema';

import type { SlotStatus } from './slot-status';

const notSold = inArray(slots.status, ['scheduled', 'published']);

/** 지금 화면 상태가 status인 매물만 */
export function slotStatusIs(status: SlotStatus, now: Date): SQL {
  switch (status) {
    case 'scheduled':
      return and(eq(slots.status, 'scheduled'), gt(slots.publishAt, now), gt(slots.startAt, now))!;
    case 'published':
      return and(
        gt(slots.startAt, now),
        or(
          eq(slots.status, 'published'),
          and(eq(slots.status, 'scheduled'), lte(slots.publishAt, now)),
        ),
      )!;
    case 'closed':
      // 원장님이 직접 마감했거나, 팔리지 않고 시작 시각이 지난 매물
      return or(eq(slots.status, 'closed'), and(notSold, lte(slots.startAt, now)))!;
    default:
      return eq(slots.status, status);
  }
}

/** 지금 홀딩 중인 매물만. 홀딩 칸이 비어 있으면 거짓(null이 아님)이라 not()으로 감싸도 된다 */
export function slotIsOnHold(now: Date): SQL {
  return and(
    isNotNull(slots.holdCustomerId),
    isNotNull(slots.holdExpiresAt),
    gt(slots.holdExpiresAt, now),
  )!;
}
