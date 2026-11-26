// 예약 작업 화면 표시 모양 (#373 ⑥).

import { describe, expect, it } from 'vitest';

import { CRON_JOBS } from '@/db/schema';

import {
  CRON_JOB_LABELS,
  CRON_JOB_SCHEDULES,
  CRON_OUTCOME_LABELS,
  CRON_STATE_LABELS,
  durationLabel,
  staleLimitLabel,
  type SummaryView,
  summaryView,
  toCronJob,
} from './format';

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 16, 3, 0, seconds));

describe('예약 작업 표시', () => {
  it('작업 4개 모두 이름과 주기가 있다', () => {
    for (const job of CRON_JOBS) {
      expect(CRON_JOB_LABELS[job], job).toBeTruthy();
      expect(CRON_JOB_SCHEDULES[job], job).toBeTruthy();
    }
  });

  it('상태 4가지와 실행 결과 4가지 모두 이름이 있다', () => {
    for (const state of ['ok', 'failing', 'stale', 'no_record'] as const) {
      expect(CRON_STATE_LABELS[state], state).toBeTruthy();
    }
    for (const outcome of ['ok', 'failed', 'running', 'stopped'] as const) {
      expect(CRON_OUTCOME_LABELS[outcome], outcome).toBeTruthy();
    }
  });

  it('늦음 기준은 분이나 시간으로', () => {
    expect(staleLimitLabel('payments-sweep')).toBe('30분');
    expect(staleLimitLabel('reminders')).toBe('15분');
    expect(staleLimitLabel('settlement-batch')).toBe('26시간');
  });

  it('주소 값은 아는 작업만', () => {
    expect(toCronJob('reminders')).toBe('reminders');
    expect(toCronJob('unknown')).toBeNull();
    expect(toCronJob(undefined)).toBeNull();
  });

  it('걸린 시간과 처리 개수', () => {
    expect(durationLabel(at(0), null)).toBe('-');
    expect(durationLabel(at(0), new Date(at(0).getTime() + 400))).toBe('1초 미만');
    expect(durationLabel(at(0), at(42))).toBe('42초');
    expect(durationLabel(at(0), at(125))).toBe('2분 5초');
    // 경계: 딱 1초는 "1초", 59초까지 초, 딱 60초부터 분
    expect(durationLabel(at(0), at(1))).toBe('1초');
    expect(durationLabel(at(0), at(59))).toBe('59초');
    expect(durationLabel(at(0), at(60))).toBe('1분 0초');
  });
});

const ok = (text: string) => ({ text, failed: false });
const bad = (text: string) => ({ text, failed: true });
const lines = (...items: [string | null, ...ReturnType<typeof ok>[]][]): SummaryView => ({
  kind: 'lines',
  lines: items.map(([title, ...parts]) => ({ title, parts })),
});

describe('처리 개수', () => {
  it('결제 정리: 일마다 한 줄, 0인 값은 빼고, 손님 결제 실패는 빨간색이 아니다', () => {
    expect(
      summaryView('payments-sweep', {
        orders: { left: 1, failed: 1, checked: 5, abandoned: 1, confirmed: 1, autoCancelled: 1 },
        cancels: { left: 1, checked: 3, cleared: 1, finished: 1 },
        windowHolds: 2,
      }),
    ).toEqual(
      lines(
        [
          '주문',
          ok('확인 5건'),
          ok('예약 확정 1건'),
          ok('자동 취소 1건'),
          ok('결제 실패로 끝남 1건'),
          ok('결제하지 않음 1건'),
          ok('다음에 다시 1건'),
        ],
        [
          '진행 중 취소·무효',
          ok('확인 3건'),
          ok('환불 끝냄 1건'),
          ok('진행 중 표시 지움 1건'),
          ok('다음에 다시 1건'),
        ],
        ['시간대 칸', ok('결제 없이 끝나 닫음 2개')],
      ),
    );
    // 개발 DB에 남은 실제 기록 모양(모두 0)
    expect(
      summaryView('payments-sweep', {
        orders: { left: 0, failed: 0, checked: 0, abandoned: 0, confirmed: 0, autoCancelled: 0 },
        cancels: { left: 0, checked: 0, cleared: 0, finished: 0 },
        windowHolds: 0,
      }),
    ).toEqual({ kind: 'idle' });
  });

  it('리마인드: 보내기 실패와 만료 알림 실패는 빨간색', () => {
    expect(
      summaryView('reminders', {
        reminders: { due: 3, failed: 1 },
        agreedCancels: { closed: 2, failed: 1, expired: 1 },
      }),
    ).toEqual(
      lines(
        ['리마인드', ok('보낼 차례 3건'), bad('보내기 실패 1건')],
        [
          '합의 후 취소 요청',
          ok('만료 1건'),
          ok('예약이 바뀌어 끝냄 2건'),
          bad('만료 알림 실패 1건'),
        ],
      ),
    );
    expect(
      summaryView('reminders', {
        reminders: { due: 0, failed: 0 },
        agreedCancels: { closed: 0, failed: 0, expired: 0 },
      }),
    ).toEqual({ kind: 'idle' });
  });

  it('정산 묶기: 지급일이 아님, 결제 수수료율 없음, 묶은 결과', () => {
    expect(summaryView('settlement-batch', { status: 'not_payout_day' })).toEqual(
      lines([null, ok('지급일이 아니에요')]),
    );
    expect(
      summaryView('settlement-batch', {
        status: 'payment_fee_rate_missing',
        payoutDate: '2026-11-26',
      }),
    ).toEqual(
      lines([null, ok('11월 26일 지급일이지만 결제 수수료율이 정해지지 않아 묶지 않았어요')]),
    );
    expect(
      summaryView('settlement-batch', {
        status: 'done',
        payoutDate: '2026-12-03',
        catchUp: true,
        shops: 2,
        items: 5,
        zeroPayouts: 1,
        skipped: 1,
        held: 3,
        failed: 1,
      }),
    ).toEqual(
      lines([
        '12월 3일 지급일(따라잡기)',
        ok('묶은 샵 2곳'),
        ok('거래 5건'),
        ok('0원이라 지급 요청 없음 1곳'),
        ok('이미 묶여 건너뜀 1곳'),
        ok('운영자 보류로 뺀 거래 3건'),
        bad('저장 실패 1곳'),
      ]),
    );
    expect(
      summaryView('settlement-batch', {
        status: 'done',
        payoutDate: '2026-12-03',
        catchUp: false,
        shops: 0,
        items: 0,
        zeroPayouts: 0,
        skipped: 0,
        held: 0,
        failed: 0,
      }),
    ).toEqual(lines(['12월 3일 지급일', ok('묶을 거래 없음')]));
  });

  it('새 매물 알림: 붙은 일마다 한 줄, 밤 시간, 등록증 목록 실패, 탈퇴 지우기 실패', () => {
    // 개발 DB에 남은 실제 기록 모양
    expect(
      summaryView('slot-digest', {
        digest: { sent: 1, failed: 0, expired: 0, skipped: null, customers: 1 },
        businessDocs: { failed: 0, checked: 6, deleted: 0 },
        consentRecheck: { due: 0, sent: 0, failed: 0 },
        withdrawalErase: { erased: 0, failed: 0, forgotten: 0, filesFailed: 0, forgetFailed: 0 },
      }),
    ).toEqual(
      lines(
        ['새 매물 알림', ok('받을 수 있는 고객 1명'), ok('보냄 1명')],
        ['사업자등록증', ok('확인 6개')],
      ),
    );
    expect(
      summaryView('slot-digest', {
        digest: { sent: 0, failed: 0, expired: 4, skipped: 'quiet_hours', customers: 0 },
        businessDocs: { error: 'unavailable' },
        consentRecheck: { due: 2, sent: 1, failed: 1 },
        withdrawalErase: { erased: 2, failed: 1, forgotten: 1, filesFailed: 1, forgetFailed: 1 },
      }),
    ).toEqual(
      lines(
        ['새 매물 알림', ok('밤 시간이라 보내지 않음'), ok('기간 지난 알림 지움 4개')],
        ['사업자등록증', bad('목록을 읽지 못함(다음 날 다시)')],
        ['동의 2년 확인 알림', ok('보낼 차례 2건'), ok('보냄 1건'), bad('보내기 실패 1건')],
        [
          '탈퇴 30일 지우기',
          ok('개인정보 지움 2건'),
          ok('로그인 정보 지움 1명'),
          bad('지우기 실패 1건'),
          bad('파일 지우기 실패 1개'),
          bad('로그인 정보 지우기 실패 1명'),
        ],
      ),
    );
  });

  it('새 매물 알림: 보내기 실패와 등록증 지우기 실패는 빨간색', () => {
    expect(
      summaryView('slot-digest', {
        digest: { sent: 3, failed: 1, expired: 0, skipped: null, customers: 4 },
        businessDocs: { failed: 1, checked: 9, deleted: 2 },
        consentRecheck: { due: 0, sent: 0, failed: 0 },
        withdrawalErase: { erased: 0, failed: 0, forgotten: 0, filesFailed: 0, forgetFailed: 0 },
      }),
    ).toEqual(
      lines(
        ['새 매물 알림', ok('받을 수 있는 고객 4명'), ok('보냄 3명'), bad('보내기 실패 1명')],
        ['사업자등록증', ok('확인 9개'), ok('지움 2개'), bad('지우기 실패 1개')],
      ),
    );
  });

  it('기록 모양이 달라도 화면이 깨지지 않는다', () => {
    // 실패했거나 도는 중이라 결과가 없다
    expect(summaryView('reminders', null)).toEqual({ kind: 'none' });
    expect(summaryView('reminders', undefined)).toEqual({ kind: 'none' });
    // 예전 기록: 나중에 붙은 일(동의 확인·탈퇴 지우기)과 나중에 생긴 값(expired)이 없다 → 없는 것은 0으로
    expect(
      summaryView('slot-digest', {
        digest: { sent: 2, failed: 0, skipped: null, customers: 2 },
        businessDocs: { failed: 0, checked: 0, deleted: 0 },
      }),
    ).toEqual(lines(['새 매물 알림', ok('받을 수 있는 고객 2명'), ok('보냄 2명')]));
    // 이름표에 없는 값과 일은 이름 그대로 붙인다(0은 뺀다)
    expect(
      summaryView('reminders', {
        reminders: { due: 1, failed: 0, retried: 2, gone: 0, empty: null },
        agreedCancels: { closed: 0, failed: 0, expired: 0 },
        extra: { sent: 1 },
        zero: 0,
        nothing: null,
      }),
    ).toEqual(
      lines(['리마인드', ok('보낼 차례 1건'), ok('retried 2')], ['extra', ok('{"sent":1}')]),
    );
    // 개수가 아닌 값이 있거나 모양이 다르면 기록 전체를 글자 그대로
    expect(summaryView('reminders', { reminders: { due: 'many' } })).toEqual({
      kind: 'raw',
      text: '{"reminders":{"due":"many"}}',
    });
    expect(summaryView('payments-sweep', { orders: 3 })).toEqual({
      kind: 'raw',
      text: '{"orders":3}',
    });
    expect(summaryView('slot-digest', [1, 2])).toEqual({ kind: 'raw', text: '[1,2]' });
    // 값이 null이면 없는 것으로(개수가 NaN이면 JSON에 null로 남는다)
    expect(summaryView('reminders', { reminders: { due: 2, failed: null } })).toEqual(
      lines(['리마인드', ok('보낼 차례 2건')]),
    );
    // 일 하나가 null이거나 개수가 아니면 기록 전체를 글자 그대로
    expect(summaryView('payments-sweep', { orders: null })).toEqual({
      kind: 'raw',
      text: '{"orders":null}',
    });
    expect(summaryView('payments-sweep', { windowHolds: '2' })).toEqual({
      kind: 'raw',
      text: '{"windowHolds":"2"}',
    });
    expect(summaryView('slot-digest', { digest: { sent: 'x', skipped: 'quiet_hours' } })).toEqual({
      kind: 'raw',
      text: '{"digest":{"sent":"x","skipped":"quiet_hours"}}',
    });
    expect(
      summaryView('settlement-batch', { status: 'done', payoutDate: '2026-12-03', shops: '2' }),
    ).toEqual({
      kind: 'raw',
      text: '{"status":"done","payoutDate":"2026-12-03","shops":"2"}',
    });
    expect(summaryView('settlement-batch', 'done')).toEqual({ kind: 'raw', text: '"done"' });
    expect(summaryView('settlement-batch', { status: 'unknown' })).toEqual({
      kind: 'raw',
      text: '{"status":"unknown"}',
    });
    // 지급일 모양이 다르면 그대로
    expect(
      summaryView('settlement-batch', { status: 'payment_fee_rate_missing', payoutDate: '12/3' }),
    ).toEqual(lines([null, ok('12/3 지급일이지만 결제 수수료율이 정해지지 않아 묶지 않았어요')]));
    for (const payoutDate of ['2026-12-03T00:00', 'x2026-12-03']) {
      expect(
        summaryView('settlement-batch', { status: 'payment_fee_rate_missing', payoutDate }),
      ).toEqual(
        lines([null, ok(`${payoutDate} 지급일이지만 결제 수수료율이 정해지지 않아 묶지 않았어요`)]),
      );
    }
    // 큰 개수는 쉼표
    expect(summaryView('reminders', { reminders: { due: 1234, failed: 0 } })).toEqual(
      lines(['리마인드', ok('보낼 차례 1,234건')]),
    );
  });
});
