'use server';

// 매물 없는 동네를 관심 동네로 (C-208, J15). 매물 목록이 비었을 때 "새 매물 알림 받기"에서 부른다.
// 저장은 내 정보 관심 동네와 같은 강규민님 함수(getInterestAreas·setInterestAreas, #172)를 그대로 쓴다.
// 관심 동네·찜한 샵 알림 동의는 저장 조건이 아니라서, 동의 여부만 돌려주고 동의는 화면에서 따로 받는다(D15)

import { refresh } from 'next/cache';

import { ok, type Result } from '@/lib/result';
import { getOptionalConsents } from '@/server/auth/customer-account';
import { getInterestAreas, setInterestAreas } from '@/server/notifications/interest-areas';

/** 동네(시·군·구) 하나를 내 관심 동네에 더한다. 이미 있으면 그대로 둔다 */
export async function watchListArea(
  sigunguCode: string,
): Promise<Result<{ interestAlertAgreed: boolean }>> {
  const current = await getInterestAreas();
  if (!current.ok) return current;
  if (!current.data.sigunguCodes.includes(sigunguCode)) {
    // 동네 코드가 동네 목록에 있는지는 setInterestAreas가 확인한다
    const saved = await setInterestAreas([...current.data.sigunguCodes, sigunguCode]);
    if (!saved.ok) return saved;
  }
  const consents = await getOptionalConsents();
  // 매물 목록이 "관심 동네로 등록된 동네예요"로 다시 그려지게 한다
  refresh();
  return ok({ interestAlertAgreed: consents.ok ? consents.data.interest_alert.agreed : false });
}
