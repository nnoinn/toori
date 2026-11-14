// 운영자 이의제기 화면(A-104, W19 ②)의 이름표와 목록 주소. 화면과 서버 어디서나 가져올 수 있다.

import type { DisputeChannel, DisputeOutcome, DisputeStatus, DisputeType } from '@/db/schema';
import { kstDateKey, formatKstTime } from '@/lib/time';

/** 목록 탭: 확인 중(기본, 정산 보류 중) / 결론 / 전체 */
export const DISPUTE_FILTERS = ['open', 'resolved', 'all'] as const;
export type DisputeFilter = (typeof DISPUTE_FILTERS)[number];

export const DISPUTE_FILTER_LABELS: Record<DisputeFilter, string> = {
  open: '확인 중',
  resolved: '결론',
  all: '전체',
};

/** 목록이 지금 어떤 순서로 보이는지(정렬 고르기 공통 부품이 들어오기 전에는 글로 알린다, #360 1번) */
export const DISPUTE_SORT_LABELS: Record<DisputeFilter, string> = {
  open: '받은 시각이 오래된 순(오래 기다린 것부터)',
  resolved: '결론을 기록한 시각이 최근인 순',
  all: '받은 시각이 최근인 순',
};

export function toDisputeFilter(value: string | undefined): DisputeFilter {
  return (DISPUTE_FILTERS as readonly string[]).includes(value ?? '')
    ? (value as DisputeFilter)
    : 'open';
}

/** 목록 주소. 기본값(확인 중, 검색어 없음)은 주소에 넣지 않는다 */
export function disputesHref(input: { filter?: DisputeFilter; query?: string } = {}): string {
  const params = new URLSearchParams();
  if (input.filter && input.filter !== 'open') params.set('status', input.filter);
  if (input.query) params.set('q', input.query);
  const search = params.toString();
  return search ? `/admin/disputes?${search}` : '/admin/disputes';
}

export const DISPUTE_TYPE_LABELS: Record<DisputeType, string> = {
  no_show: '노쇼 이의',
  refund_exception: '환불 예외',
  after_start: '시작 후 문제',
};

export const DISPUTE_CHANNEL_LABELS: Record<DisputeChannel, string> = {
  app: '앱',
  kakao: '카카오톡 채널',
};

/** 상세의 경로: 누가 어떻게 남겼는지 풀어서 (이의제기는 손님만 신청한다, 11/13 nnoinn) */
export const DISPUTE_CHANNEL_DETAIL_LABELS: Record<DisputeChannel, string> = {
  app: '앱에서 손님이 직접 접수',
  kakao: '카카오톡 채널로 받아 운영자가 등록',
};

export const DISPUTE_OUTCOME_LABELS: Record<DisputeOutcome, string> = {
  no_show_confirmed: '노쇼 확정',
  no_show_reversed: '노쇼 취소(방문으로 바꿈)',
  refund_exception: '환불 예외',
  voided: '무효',
  owner_fault_cancel: '원장님 사정 취소로 바꿈',
  no_change: '바꿀 것 없음',
};

/** 상태 이름. 결론이 났으면 결론 종류를 보여준다 */
export function labelDisputeStatus(status: DisputeStatus, outcome: DisputeOutcome | null): string {
  if (status === 'resolved' && outcome) return DISPUTE_OUTCOME_LABELS[outcome];
  return '확인 중';
}

/** 결론 고르기 칸 하나. ready: 처리 기능이 있어 지금 고를 수 있음, allowed: 이 예약에서 고를 수 있음(노쇼 결론은 노쇼 예약만) */
export type OutcomeOption = {
  value: DisputeOutcome;
  label: string;
  ready: boolean;
  allowed: boolean;
};

/** 카카오톡 채널에서 받은 시각 칸(<input type="datetime-local">, 한국 시간)의 값. 예: "2026-11-13T14:05" */
export function toKstInputValue(date: Date): string {
  return `${kstDateKey(date)}T${formatKstTime(date)}`;
}

/** 받은 시각 칸의 값(한국 시간)을 서버에 넘길 ISO 시각으로. 모양이 틀리면 null */
export function fromKstInputValue(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+09:00` : null;
}
