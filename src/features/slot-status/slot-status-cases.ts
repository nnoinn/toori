// 매물 상태 계산 테스트 경우 (Issue #57 2장 표 + 경계).
// 순수 함수(slot-status.test.ts)와 DB 조건(slot-status-sql.test.ts)이 같은 경우로 같은 답을 내는지 확인한다.

import type { SlotStatus, SlotStatusInput } from './slot-status';

export type SlotStatusCase = {
  name: string;
  slot: SlotStatusInput;
  now: Date;
  expected: SlotStatus;
};

const at = (iso: string) => new Date(`${iso}+09:00`);
const ms = (date: Date, delta: number) => new Date(date.getTime() + delta);

// 게시 10/30 12:00, 시작 11/01 12:00 (한국 시간)
const publishAt = at('2026-10-30T12:00:00');
const startAt = at('2026-11-01T12:00:00');
const beforePublish = at('2026-10-29T12:00:00');
const betweenPublishAndStart = at('2026-10-31T12:00:00');
const afterStart = at('2026-11-02T12:00:00');

const slot = (status: SlotStatus): SlotStatusInput => ({ status, publishAt, startAt });

export const SLOT_STATUS_CASES: SlotStatusCase[] = [
  // 저장 값 scheduled
  {
    name: '예약대기: 게시 시각 전이면 예약대기',
    slot: slot('scheduled'),
    now: beforePublish,
    expected: 'scheduled',
  },
  {
    name: '예약대기: 게시 시각 1ms 전이면 예약대기',
    slot: slot('scheduled'),
    now: ms(publishAt, -1),
    expected: 'scheduled',
  },
  {
    name: '예약대기: 게시 시각과 같으면 게시중',
    slot: slot('scheduled'),
    now: publishAt,
    expected: 'published',
  },
  {
    name: '예약대기: 게시 시각 1ms 뒤면 게시중',
    slot: slot('scheduled'),
    now: ms(publishAt, 1),
    expected: 'published',
  },
  {
    name: '예약대기: 게시~시작 사이면 게시중',
    slot: slot('scheduled'),
    now: betweenPublishAndStart,
    expected: 'published',
  },
  {
    name: '예약대기: 시작 시각 1ms 전이면 게시중',
    slot: slot('scheduled'),
    now: ms(startAt, -1),
    expected: 'published',
  },
  {
    name: '예약대기: 시작 시각과 같으면 마감',
    slot: slot('scheduled'),
    now: startAt,
    expected: 'closed',
  },
  {
    name: '예약대기: 시작 시각이 지나면 마감',
    slot: slot('scheduled'),
    now: afterStart,
    expected: 'closed',
  },
  // 저장 값 published (게시 시각과 상관없이 시작 시각만 본다)
  {
    name: '게시중: 시작 시각 전이면 게시중',
    slot: slot('published'),
    now: betweenPublishAndStart,
    expected: 'published',
  },
  {
    name: '게시중: 게시 시각 전에 바로 게시했어도 게시중',
    slot: slot('published'),
    now: beforePublish,
    expected: 'published',
  },
  {
    name: '게시중: 시작 시각 1ms 전이면 게시중',
    slot: slot('published'),
    now: ms(startAt, -1),
    expected: 'published',
  },
  {
    name: '게시중: 시작 시각과 같으면 마감',
    slot: slot('published'),
    now: startAt,
    expected: 'closed',
  },
  {
    name: '게시중: 시작 시각 1ms 뒤면 마감',
    slot: slot('published'),
    now: ms(startAt, 1),
    expected: 'closed',
  },
  // 저장 값 그대로인 상태
  {
    name: '예약됨: 시작 전이면 예약됨',
    slot: slot('reserved'),
    now: betweenPublishAndStart,
    expected: 'reserved',
  },
  {
    name: '예약됨: 시작이 지나도 방문·노쇼 처리 전까지 예약됨',
    slot: slot('reserved'),
    now: afterStart,
    expected: 'reserved',
  },
  {
    name: '마감: 시작 전에도 원장님이 마감했으면 마감',
    slot: slot('closed'),
    now: betweenPublishAndStart,
    expected: 'closed',
  },
  {
    name: '마감: 게시 시각 전에 마감했어도 마감',
    slot: slot('closed'),
    now: beforePublish,
    expected: 'closed',
  },
  {
    name: '취소: 시작 전이면 취소',
    slot: slot('cancelled'),
    now: betweenPublishAndStart,
    expected: 'cancelled',
  },
  {
    name: '취소: 시작이 지나도 취소',
    slot: slot('cancelled'),
    now: afterStart,
    expected: 'cancelled',
  },
  {
    name: '완료: 시작이 지나면 완료',
    slot: slot('completed'),
    now: afterStart,
    expected: 'completed',
  },
];
