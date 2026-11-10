// 관심 동네·찜한 샵 새 매물 알림 보내기 (C-601·C-209, W17 ②, #270). 예약 작업(/api/cron/slot-digest)이 매일 오후 1시에 부른다.
// 광고성 정보라 제목 앞에 (광고)와 보내는 곳, 내용에 수신 거부 방법을 넣고, 밤 9시~아침 8시에는 보내지 않는다(동의 문구 6장).
// 받는 고객은 '관심 동네·찜한 샵 새 매물 알림' 동의(interest_alert)만 본다. 이벤트·혜택 동의(marketing)와 상관없다(11/8).

import 'server-only';

import type { getDb } from '@/db';
import { regionListHref } from '@/features/map/region-link';
import { findRegion } from '@/features/map/regions';
import { SITE_NAME } from '@/lib/site';
import { addHours, kstDateKey, utcToKst } from '@/lib/time';
import { PUSH_QUIET_HOURS } from '@/server/policy';

import {
  type DigestSlot,
  digestDedupeKey,
  readDigestCustomers,
  readDigestSlots,
} from './digest-store';
import { notify } from './notify';

type Db = ReturnType<typeof getDb>;

const EVENT = 'slot.digest';
/** 하루 한 번 보내므로 지난 알림 뒤(24시간 안)에 게시된 매물을 담는다 */
const DIGEST_WINDOW_HOURS = 24;
/** 한 번 실행에서 볼 고객 수 */
const DIGEST_CUSTOMER_LIMIT = 1000;
/** 동시에 처리하는 고객 수 */
const SEND_CONCURRENCY = 10;

export type DigestSummary = {
  /** 알림을 받을 수 있는 고객 수 */
  customers: number;
  /** 새 매물이 있어 보낸 고객 수 */
  sent: number;
  failed: number;
  /** 밤 시간이라 보내지 않았으면 'quiet_hours' */
  skipped: 'quiet_hours' | null;
};

/** 광고성 알림을 보내지 않는 시간(밤 9시~아침 8시, 한국 시간)인지 */
export function isQuietHour(now: Date): boolean {
  const { hour } = utcToKst(now);
  const { start, end } = PUSH_QUIET_HOURS;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/**
 * 알림 문구와 열 주소. 매물이 없으면 null.
 * 찜한 샵 매물이 있으면 찜한 샵 매물 화면, 관심 동네 매물만 있으면 매물이 가장 많은 동네 목록으로 간다(#270)
 */
export function digestMessage(
  slots: readonly DigestSlot[],
): { title: string; body: string; url: string } | null {
  if (slots.length === 0) return null;
  const counts = new Map<string, { code: string; name: string; count: number }>();
  for (const slot of slots) {
    if (!slot.inArea) continue;
    const entry = counts.get(slot.sigunguCode) ?? {
      code: slot.sigunguCode,
      name: findRegion(slot.sigunguCode)?.name ?? slot.sigungu,
      count: 0,
    };
    entry.count += 1;
    counts.set(slot.sigunguCode, entry);
  }
  const regions = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.code.localeCompare(b.code),
  );
  const hasFavorite = slots.some((slot) => slot.favorite);

  const places: string[] = [];
  if (hasFavorite) places.push('찜한 샵');
  if (regions.length > 0) {
    places.push(
      regions.length > 1 ? `${regions[0].name} 외 ${regions.length - 1}곳` : regions[0].name,
    );
  }
  const maxDiscount = Math.max(...slots.map((slot) => slot.discountRate));
  return {
    title: `(광고) ${SITE_NAME} · ${places.join('과 ')}에 새 매물 ${slots.length}개가 올라왔어요`,
    body: `최대 ${maxDiscount}% 할인. 알림 끄기: 내 정보 > 알림 설정`,
    url: hasFavorite
      ? '/home/favorites'
      : regions.length > 0
        ? regionListHref(regions[0].code)
        : '/home',
  };
}

/**
 * 오늘 알림을 받을 수 있는 고객마다 새 매물을 모아 알림 하나를 보낸다. 새 매물이 없으면 보내지 않는다.
 * 같은 날 다시 불러도 이미 받은 고객에게는 보내지 않는다. 한 고객이 실패해도 나머지는 보낸다
 */
export async function sendSlotDigest(db: Db, now: Date): Promise<DigestSummary> {
  if (isQuietHour(now)) return { customers: 0, sent: 0, failed: 0, skipped: 'quiet_hours' };
  const dateKey = kstDateKey(now);
  const since = addHours(now, -DIGEST_WINDOW_HOURS);
  const targets = await readDigestCustomers(db, { dateKey, limit: DIGEST_CUSTOMER_LIMIT });
  if (targets.length === DIGEST_CUSTOMER_LIMIT) {
    console.error('[notify] 새 매물 알림 대상이 한 번에 볼 수를 넘었어요:', DIGEST_CUSTOMER_LIMIT);
  }

  const summary: DigestSummary = { customers: targets.length, sent: 0, failed: 0, skipped: null };
  for (let start = 0; start < targets.length; start += SEND_CONCURRENCY) {
    const results = await Promise.allSettled(
      targets.slice(start, start + SEND_CONCURRENCY).map(async (target) => {
        const slots = await readDigestSlots(db, { customerId: target.customerId, since, now });
        const message = digestMessage(slots);
        if (!message) return false;
        await notify(db, {
          userId: target.userId,
          accountType: 'customer',
          event: EVENT,
          dedupeKey: digestDedupeKey(target.customerId, dateKey),
          ...message,
        });
        return true;
      }),
    );
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value) summary.sent += 1;
        continue;
      }
      summary.failed += 1;
      console.error(
        '[notify] 새 매물 알림 실패:',
        result.reason instanceof Error ? result.reason.name : 'unknown',
      );
    }
  }
  return summary;
}
