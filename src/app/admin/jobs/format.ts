// 예약 작업 화면(#373 ⑥)의 이름표와 표시 모양. 화면 코드에서만 쓴다.

import { CRON_JOBS, type CronJob } from '@/db/schema';
import type {
  PaymentsSweepSummary,
  RemindersSummary,
  SettlementBatchSummary,
  SlotDigestRunSummary,
} from '@/server/cron/summaries';
import { CRON_STALE_MINUTES } from '@/server/policy/cron';

import type { CronJobState, CronRunOutcome } from './status';

export const JOBS_PATH = '/admin/jobs';

export const CRON_JOB_LABELS: Record<CronJob, string> = {
  'payments-sweep': '결제 정리',
  reminders: '리마인드',
  'settlement-batch': '정산 묶기',
  'slot-digest': '새 매물 알림',
};

/** 언제 도는지(src/db/cron/*.sql, 한국 시간) */
export const CRON_JOB_SCHEDULES: Record<CronJob, string> = {
  'payments-sweep': '10분마다',
  reminders: '5분마다',
  'settlement-batch': '매일 0시 30분',
  'slot-digest': '매일 오후 1시',
};

export const CRON_STATE_LABELS: Record<CronJobState, string> = {
  ok: '정상',
  failing: '실패 중',
  stale: '늦음',
  no_record: '기록 없음',
};

export const CRON_OUTCOME_LABELS: Record<CronRunOutcome, string> = {
  ok: '성공',
  failed: '실패',
  running: '도는 중',
  stopped: '중간에 멈춤',
};

/** 늦음 기준 안내. 예: "30분", "26시간" */
export function staleLimitLabel(job: CronJob): string {
  const minutes = CRON_STALE_MINUTES[job];
  return minutes % 60 === 0 ? `${minutes / 60}시간` : `${minutes}분`;
}

/** 주소 값의 작업. 모르는 값이면 null */
export function toCronJob(value: string | undefined): CronJob | null {
  return CRON_JOBS.find((job) => job === value) ?? null;
}

/** 걸린 시간. 1초 미만은 "1초 미만" */
export function durationLabel(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return '-';
  const seconds = Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000);
  if (seconds < 1) return '1초 미만';
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

// ── 처리 개수 ──
// 작업이 돌려준 결과(src/server/cron/summaries.ts)를 값마다 한국어 이름으로 보여 준다. 0인 값은 뺀다.
// 이름표는 결과 타입의 키에 묶여 있어서 작업이 새 값을 돌려주면 이름표를 붙이기 전까지 타입 검사에서 걸린다.
// 기록은 DB에 남은 값이라 모양이 다를 수 있다: 예전 기록에 없는 값은 0으로 보고, 이름표에 없는 값은 이름 그대로 붙이고,
// 개수가 아닌 값이 있으면 기록 전체를 글자 그대로 보여 준다(화면이 깨지지 않게)

/** 처리 개수의 한 칸. failed: 작업 안에서 실패한 개수라 빨간색으로 보여 준다 */
export type SummaryPart = { text: string; failed: boolean };
/** 처리 개수의 한 줄: 작업 안의 일 하나(예: 주문, 리마인드). 일이 하나뿐이면 title이 없다 */
export type SummaryLine = { title: string | null; parts: SummaryPart[] };
/** 처리 개수 칸: 기록 없음(실패·도는 중) / 처리할 것 없음 / 줄 / 모양을 모르는 기록(글자 그대로) */
export type SummaryView =
  | { kind: 'none' }
  | { kind: 'idle' }
  | { kind: 'lines'; lines: SummaryLine[] }
  | { kind: 'raw'; text: string };

type CountLabel = { label: string; unit: string; failed: boolean };
type CountLabels<T> = { [K in keyof T]-?: CountLabel };
type Groups<T> = {
  [K in keyof T]-?: { title: string; read: (value: unknown) => SummaryPart[] | null };
};

const count = (label: string, unit: string): CountLabel => ({ label, unit, failed: false });
const failure = (label: string, unit: string): CountLabel => ({ label, unit, failed: true });

function part({ label, unit, failed }: CountLabel, n: number): SummaryPart {
  return { text: `${label} ${n.toLocaleString('ko-KR')}${unit}`, failed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 개수 묶음 하나. handled는 따로 보여 주는 값이라 이름 그대로 붙이지 않는다. 개수 묶음이 아니면 null */
function countParts<T>(
  group: unknown,
  labels: CountLabels<T>,
  handled: string[] = [],
): SummaryPart[] | null {
  if (!isRecord(group)) return null;
  const parts: SummaryPart[] = [];
  const entries = Object.entries(labels) as [string, CountLabel][];
  for (const [key, label] of entries) {
    const n = group[key];
    if (n === undefined || n === null) continue;
    if (typeof n !== 'number') return null;
    if (n > 0) parts.push(part(label, n));
  }
  for (const [key, value] of Object.entries(group)) {
    if (key in labels || handled.includes(key) || value === 0 || value === null) continue;
    parts.push({ text: `${key} ${JSON.stringify(value)}`, failed: false });
  }
  return parts;
}

/** 개수 하나(묶음이 아닌 값) */
function singleCount(value: unknown, label: CountLabel): SummaryPart[] | null {
  if (typeof value !== 'number') return null;
  return value > 0 ? [part(label, value)] : [];
}

/** 일마다 한 줄. 예전 기록에 없는 일은 빼고, 이름표에 없는 일은 이름 그대로 한 줄 */
function groupLines<T>(summary: unknown, groups: Groups<T>): SummaryView {
  if (!isRecord(summary)) return rawView(summary);
  const lines: SummaryLine[] = [];
  const entries = Object.entries(groups) as [string, Groups<T>[keyof T]][];
  for (const [key, { title, read }] of entries) {
    if (summary[key] === undefined) continue;
    const parts = read(summary[key]);
    if (!parts) return rawView(summary);
    if (parts.length > 0) lines.push({ title, parts });
  }
  for (const [key, value] of Object.entries(summary)) {
    if (key in groups || value === 0 || value === null) continue;
    lines.push({ title: key, parts: [{ text: JSON.stringify(value), failed: false }] });
  }
  return lines.length > 0 ? { kind: 'lines', lines } : { kind: 'idle' };
}

function rawView(summary: unknown): SummaryView {
  return { kind: 'raw', text: JSON.stringify(summary) };
}

const ORDER_LABELS: CountLabels<PaymentsSweepSummary['orders']> = {
  checked: count('확인', '건'),
  confirmed: count('예약 확정', '건'),
  autoCancelled: count('자동 취소', '건'),
  // 손님 결제가 실패·취소로 끝난 주문이다. 작업이 실패한 것이 아니다
  failed: count('결제 실패로 끝남', '건'),
  abandoned: count('결제하지 않음', '건'),
  left: count('다음에 다시', '건'),
};

const CANCEL_LABELS: CountLabels<PaymentsSweepSummary['cancels']> = {
  checked: count('확인', '건'),
  finished: count('환불 끝냄', '건'),
  cleared: count('진행 중 표시 지움', '건'),
  left: count('다음에 다시', '건'),
};

const REMINDER_LABELS: CountLabels<RemindersSummary['reminders']> = {
  due: count('보낼 차례', '건'),
  failed: failure('보내기 실패', '건'),
};

const AGREED_CANCEL_LABELS: CountLabels<RemindersSummary['agreedCancels']> = {
  expired: count('만료', '건'),
  closed: count('예약이 바뀌어 끝냄', '건'),
  failed: failure('만료 알림 실패', '건'),
};

const DIGEST_LABELS: CountLabels<Omit<SlotDigestRunSummary['digest'], 'skipped'>> = {
  customers: count('받을 수 있는 고객', '명'),
  sent: count('보냄', '명'),
  failed: failure('보내기 실패', '명'),
  expired: count('기간 지난 알림 지움', '개'),
};

const BUSINESS_DOC_LABELS: CountLabels<
  Extract<SlotDigestRunSummary['businessDocs'], { checked: number }>
> = {
  checked: count('확인', '개'),
  deleted: count('지움', '개'),
  failed: failure('지우기 실패', '개'),
};

const CONSENT_RECHECK_LABELS: CountLabels<SlotDigestRunSummary['consentRecheck']> = {
  due: count('보낼 차례', '건'),
  sent: count('보냄', '건'),
  failed: failure('보내기 실패', '건'),
};

const WITHDRAWAL_ERASE_LABELS: CountLabels<SlotDigestRunSummary['withdrawalErase']> = {
  erased: count('개인정보 지움', '건'),
  forgotten: count('로그인 정보 지움', '명'),
  failed: failure('지우기 실패', '건'),
  filesFailed: failure('파일 지우기 실패', '개'),
  forgetFailed: failure('로그인 정보 지우기 실패', '명'),
};

type SettlementDone = Extract<SettlementBatchSummary, { status: 'done' }>;
const SETTLEMENT_LABELS: CountLabels<Omit<SettlementDone, 'status' | 'payoutDate' | 'catchUp'>> = {
  shops: count('묶은 샵', '곳'),
  items: count('거래', '건'),
  zeroPayouts: count('0원이라 지급 요청 없음', '곳'),
  skipped: count('이미 묶여 건너뜀', '곳'),
  held: count('운영자 보류로 뺀 거래', '건'),
  failed: failure('저장 실패', '곳'),
};

const PAYMENTS_SWEEP_GROUPS: Groups<PaymentsSweepSummary> = {
  orders: { title: '주문', read: (value) => countParts(value, ORDER_LABELS) },
  cancels: { title: '진행 중 취소·무효', read: (value) => countParts(value, CANCEL_LABELS) },
  windowHolds: {
    title: '시간대 칸',
    read: (value) => singleCount(value, count('결제 없이 끝나 닫음', '개')),
  },
};

const REMINDERS_GROUPS: Groups<RemindersSummary> = {
  reminders: { title: '리마인드', read: (value) => countParts(value, REMINDER_LABELS) },
  agreedCancels: {
    title: '합의 후 취소 요청',
    read: (value) => countParts(value, AGREED_CANCEL_LABELS),
  },
};

const SLOT_DIGEST_GROUPS: Groups<SlotDigestRunSummary> = {
  digest: {
    title: '새 매물 알림',
    read: (value) => {
      const parts = countParts(value, DIGEST_LABELS, ['skipped']);
      if (!parts || !isRecord(value) || value.skipped !== 'quiet_hours') return parts;
      return [{ text: '밤 시간이라 보내지 않음', failed: false }, ...parts];
    },
  },
  businessDocs: {
    title: '사업자등록증',
    read: (value) =>
      isRecord(value) && value.error === 'unavailable'
        ? [{ text: '목록을 읽지 못함(다음 날 다시)', failed: true }]
        : countParts(value, BUSINESS_DOC_LABELS),
  },
  consentRecheck: {
    title: '동의 2년 확인 알림',
    read: (value) => countParts(value, CONSENT_RECHECK_LABELS),
  },
  withdrawalErase: {
    title: '탈퇴 30일 지우기',
    read: (value) => countParts(value, WITHDRAWAL_ERASE_LABELS),
  },
};

/** 지급일 "2026-11-26" → "11월 26일". 모양이 다르면 그대로 */
function payoutDateLabel(value: unknown): string {
  const text = String(value);
  const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(text);
  return match ? `${Number(match[1])}월 ${Number(match[2])}일` : text;
}

function settlementView(summary: unknown): SummaryView {
  if (!isRecord(summary)) return rawView(summary);
  const only = (text: string): SummaryView => ({
    kind: 'lines',
    lines: [{ title: null, parts: [{ text, failed: false }] }],
  });
  if (summary.status === 'not_payout_day') return only('지급일이 아니에요');
  const date = payoutDateLabel(summary.payoutDate);
  if (summary.status === 'payment_fee_rate_missing') {
    return only(`${date} 지급일이지만 결제 수수료율이 정해지지 않아 묶지 않았어요`);
  }
  if (summary.status !== 'done') return rawView(summary);
  const parts = countParts(summary, SETTLEMENT_LABELS, ['status', 'payoutDate', 'catchUp']);
  if (!parts) return rawView(summary);
  const title = `${date} 지급일${summary.catchUp === true ? '(따라잡기)' : ''}`;
  return {
    kind: 'lines',
    lines: [
      { title, parts: parts.length > 0 ? parts : [{ text: '묶을 거래 없음', failed: false }] },
    ],
  };
}

/** 처리 개수 칸. 실패했거나 도는 중이라 결과가 없으면 none */
export function summaryView(job: CronJob, summary: unknown): SummaryView {
  if (summary === null || summary === undefined) return { kind: 'none' };
  switch (job) {
    case 'payments-sweep':
      return groupLines(summary, PAYMENTS_SWEEP_GROUPS);
    case 'reminders':
      return groupLines(summary, REMINDERS_GROUPS);
    case 'settlement-batch':
      return settlementView(summary);
    case 'slot-digest':
      return groupLines(summary, SLOT_DIGEST_GROUPS);
  }
}
