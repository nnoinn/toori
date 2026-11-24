// 2년마다 광고성 정보 수신 동의 확인 알림 보내기 (#535). 동의 읽기와 notify는 가짜로 바꾼다.
// 어떤 동의를 읽는지는 consent-recheck-store.db.test.ts, 날짜 계산과 문구는 consent-recheck-rules.test.ts가 본다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { getDb } from '@/db';

import type { RecheckAgreement } from './consent-recheck-store';

const state = vi.hoisted(() => ({
  agreements: [] as RecheckAgreement[],
  agreementReads: [] as { agreedBefore: Date }[],
  sentKeys: new Set<string>(),
  keyReads: [] as string[][],
  sent: [] as Record<string, unknown>[],
  failFor: null as string | null,
}));

vi.mock('./consent-recheck-store', () => ({
  readRecheckAgreements: async (_db: unknown, input: { agreedBefore: Date }) => {
    state.agreementReads.push(input);
    return state.agreements;
  },
  readSentDedupeKeys: async (_db: unknown, keys: readonly string[]) => {
    state.keyReads.push([...keys]);
    return new Set(keys.filter((key) => state.sentKeys.has(key)));
  },
}));
vi.mock('./notify', () => ({
  notify: async (_db: unknown, input: { userId: string }) => {
    if (input.userId === state.failFor) throw new Error('push down');
    state.sent.push(input);
  },
}));

const { sendConsentRechecks } = await import('./consent-recheck');

const db = {} as ReturnType<typeof getDb>;
const kst = (text: string) => new Date(`${text}+09:00`);
/** 11/23 13:00(한국 시간) */
const NOW = kst('2026-11-23T13:00:00');

function agreement(extra: Partial<RecheckAgreement> = {}): RecheckAgreement {
  return {
    agreementId: crypto.randomUUID(),
    userId: crypto.randomUUID(),
    termsType: 'marketing',
    agreedAt: kst('2024-11-23T15:00:00'),
    ...extra,
  };
}

beforeEach(() => {
  state.agreements = [];
  state.agreementReads = [];
  state.sentKeys = new Set();
  state.keyReads = [];
  state.sent = [];
  state.failFor = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sendConsentRechecks', () => {
  it('확인 날이 된 동의마다 고객 알림을 하나씩 보낸다(내 정보로 가는 주소, 동의 문구 6-2장)', async () => {
    const due = agreement();
    state.agreements = [due];

    const summary = await sendConsentRechecks(db, NOW);

    expect(summary).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(state.sent).toEqual([
      {
        userId: due.userId,
        accountType: 'customer',
        event: 'consent.recheck',
        dedupeKey: `consent.recheck:${due.agreementId}:1`,
        url: '/me',
        title: '이벤트·혜택 소식 수신 동의 확인',
        body: '투리 · 2024년 11월 23일에 이벤트·혜택 소식(광고성 정보) 수신에 동의하셨어요. 계속 받으시려면 하실 일이 없어요. 그만 받으려면 내 정보 > 알림 설정에서 끌 수 있어요.',
      },
    ]);
  });

  it('DB에서는 24개월 전(며칠 넉넉히) 전에 동의한 것만 읽는다', async () => {
    await sendConsentRechecks(db, NOW);
    expect(state.agreementReads).toHaveLength(1);
    const { agreedBefore } = state.agreementReads[0];
    expect(agreedBefore.getTime()).toBeGreaterThan(kst('2024-11-23T13:00:00').getTime());
    expect(agreedBefore.getTime()).toBeLessThan(kst('2024-12-01T00:00:00').getTime());
  });

  it('확인 날이 아니거나 보내는 기간(30일)이 지난 동의는 보내지 않는다', async () => {
    state.agreements = [
      agreement({ agreedAt: kst('2024-11-24T09:00:00') }), // 내일이 확인 날
      agreement({ agreedAt: kst('2024-10-23T09:00:00') }), // 확인 날부터 31일 지남
    ];
    const summary = await sendConsentRechecks(db, NOW);
    expect(summary).toEqual({ due: 0, sent: 0, failed: 0 });
    expect(state.sent).toEqual([]);
  });

  it('4년 되는 날은 2번째 차례 열쇠로 보낸다', async () => {
    const second = agreement({ agreedAt: kst('2022-11-23T09:00:00'), termsType: 'interest_alert' });
    state.agreements = [second];
    await sendConsentRechecks(db, NOW);
    expect(state.sent).toMatchObject([
      {
        dedupeKey: `consent.recheck:${second.agreementId}:2`,
        title: '관심 동네·찜한 샵 새 매물 알림 수신 동의 확인',
      },
    ]);
  });

  it('이미 보낸 차례는 다시 보내지 않고 세지도 않는다(같은 날 다시 불러도)', async () => {
    const already = agreement();
    const fresh = agreement();
    state.agreements = [already, fresh];
    state.sentKeys = new Set([`consent.recheck:${already.agreementId}:1`]);

    const summary = await sendConsentRechecks(db, NOW);

    expect(state.keyReads).toEqual([
      [`consent.recheck:${already.agreementId}:1`, `consent.recheck:${fresh.agreementId}:1`],
    ]);
    expect(summary).toEqual({ due: 1, sent: 1, failed: 0 });
    expect(state.sent).toMatchObject([{ userId: fresh.userId }]);
  });

  it('한 건이 실패해도 나머지는 보내고, 실패는 이름만 남긴다', async () => {
    const broken = agreement();
    const others = Array.from({ length: 11 }, () => agreement());
    state.agreements = [broken, ...others];
    state.failFor = broken.userId;

    const summary = await sendConsentRechecks(db, NOW);

    expect(summary).toEqual({ due: 12, sent: 11, failed: 1 });
    expect(state.sent).toHaveLength(11);
    expect(console.error).toHaveBeenCalledWith('[notify] 수신 동의 확인 알림 실패:', 'Error');
  });
});
