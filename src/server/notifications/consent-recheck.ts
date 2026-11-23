// 2년마다 광고성 정보 수신 동의 확인 알림 보내기 (#535, 동의 문구 6-2장, 정보통신망법 시행령 62조의3).
// 예약 작업(/api/cron/slot-digest)이 매일 오후 1시에 부른다. 확인 날이 된 동의마다 알림 하나를 보내고 알림함에 남긴다.
// 알림 자체는 광고가 아니라 동의 사실을 알리는 것이라 (광고)를 붙이지 않는다. 받는 고객이 할 일은 없고, 끄려면 내 정보 > 알림 설정으로 간다.

import 'server-only';

import type { getDb } from '@/db';
import { MARKETING_CONSENT_RECHECK_MONTHS } from '@/server/policy';

import {
  consentRecheckKey,
  consentRecheckText,
  dueRecheckRound,
  recheckAgreedBefore,
} from './consent-recheck-rules';
import { readRecheckAgreements, readSentDedupeKeys } from './consent-recheck-store';
import { notify } from './notify';

type Db = ReturnType<typeof getDb>;

const EVENT = 'consent.recheck';
/** 알림을 누르면 여는 화면(내 정보. 알림 설정이 있다) */
const RECHECK_URL = '/me';
/** 동시에 처리하는 동의 수 */
const SEND_CONCURRENCY = 10;

export type ConsentRecheckSummary = {
  /** 오늘 확인 알림을 보낼 차례인 동의 수(이미 보낸 것 빼고) */
  due: number;
  sent: number;
  failed: number;
};

/**
 * 확인 날이 된 동의마다 확인 알림을 보낸다. 같은 동의의 같은 차례에는 한 번만 보낸다(다시 불러도 이미 보낸 것은 세지 않는다).
 * 한 건이 실패해도 나머지는 보낸다
 */
export async function sendConsentRechecks(db: Db, now: Date): Promise<ConsentRecheckSummary> {
  const agreements = await readRecheckAgreements(db, {
    agreedBefore: recheckAgreedBefore(now, MARKETING_CONSENT_RECHECK_MONTHS),
  });
  const candidates = agreements.flatMap((agreement) => {
    const round = dueRecheckRound(agreement.agreedAt, now, MARKETING_CONSENT_RECHECK_MONTHS);
    return round === null
      ? []
      : [{ ...agreement, dedupeKey: consentRecheckKey(agreement.agreementId, round) }];
  });
  const sentKeys = await readSentDedupeKeys(
    db,
    candidates.map((candidate) => candidate.dedupeKey),
  );
  const due = candidates.filter((candidate) => !sentKeys.has(candidate.dedupeKey));

  const summary: ConsentRecheckSummary = { due: due.length, sent: 0, failed: 0 };
  for (let start = 0; start < due.length; start += SEND_CONCURRENCY) {
    const results = await Promise.allSettled(
      due.slice(start, start + SEND_CONCURRENCY).map((item) =>
        notify(db, {
          userId: item.userId,
          accountType: 'customer',
          event: EVENT,
          dedupeKey: item.dedupeKey,
          url: RECHECK_URL,
          ...consentRecheckText(item.termsType, item.agreedAt),
        }),
      ),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        summary.sent += 1;
        continue;
      }
      summary.failed += 1;
      console.error(
        '[notify] 수신 동의 확인 알림 실패:',
        result.reason instanceof Error ? result.reason.name : 'unknown',
      );
    }
  }
  return summary;
}
