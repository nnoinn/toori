// 예약 작업이 부르는 주소의 확인 (K8). 서버에서만 부른다.
// pg_cron이 pg_net으로 우리 서버의 /api/cron/... 주소를 부를 때 Authorization 헤더에 CRON_SECRET을 담아 보낸다(값은 Supabase Vault에 둔다).

import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/** 예약 작업이 부른 요청인지. CRON_SECRET이 없으면 모두 거절한다 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET이 없어요');
    return false;
  }
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
