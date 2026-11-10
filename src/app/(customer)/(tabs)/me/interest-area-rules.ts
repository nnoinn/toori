// 관심 동네 고르기 규칙과 문구 (J14, C-601, D15). 화면에서 쓴다. 저장은 강규민님 setInterestAreas(#172).
// 문구 안의 시각은 정책값에서 가져온다(동의 문구 1-2와 같은 내용).

import { REGIONS } from '@/features/map/regions';
import { formatHourLabel } from '@/lib/time';
import { INTEREST_DIGEST_HOUR, PUSH_QUIET_HOURS } from '@/server/policy';
import { OPTIONAL_CONSENT_NAMES } from './profile-rules';

/** 동네 하나를 켜거나 끈 목록. 동네 고르기 목록(REGIONS) 순서로 둔다(서버도 같은 순서로 돌려준다) */
export function toggleInterestArea(codes: readonly string[], code: string): string[] {
  const next = codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
  return REGIONS.map((region) => region.code).filter((c) => next.includes(c));
}

/** 관심 동네 알림이 언제 오는지 */
export const INTEREST_AREA_NOTE =
  `관심 동네에 새 매물이 올라오면 하루 한 번 ${formatHourLabel(INTEREST_DIGEST_HOUR)}에 알려 드려요. ` +
  `${formatHourLabel(PUSH_QUIET_HOURS.start)}부터 ${formatHourLabel(PUSH_QUIET_HOURS.end)}까지는 보내지 않아요.`;

/** 관심 동네를 골랐는데 관심 동네·찜한 샵 알림 동의가 없을 때(D15). 이 자리에서 동의를 받는다 */
export const INTEREST_NEEDS_CONSENT = `${OPTIONAL_CONSENT_NAMES.interest_alert}은 광고성 정보라서 수신에 동의해야 받을 수 있어요.`;

/** 찜을 눌렀는데 관심 동네·찜한 샵 알림 동의가 없을 때 (#270 3번) */
export const FAVORITE_NEEDS_CONSENT = '새 매물 알림도 받으려면 동의가 필요해요';

export const FAVORITE_ALERT_NOTE =
  `찜한 샵과 관심 동네의 새 할인 매물을 하루 한 번 ${formatHourLabel(INTEREST_DIGEST_HOUR)}에 알려 드려요(광고성 정보). ` +
  `${formatHourLabel(PUSH_QUIET_HOURS.start)}부터 ${formatHourLabel(PUSH_QUIET_HOURS.end)}까지는 보내지 않아요.`;
