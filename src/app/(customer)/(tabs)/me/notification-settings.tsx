'use client';

import { InterestAreas } from './interest-areas';
import { MarketingSwitch, useMarketingConsent } from './marketing-switch';

/**
 * 내 정보 > 알림 설정 (C-103, C-601, J14). 관심 동네와 관심 동네 새 매물 알림(광고성 정보 수신 동의).
 * 관심 동네의 "동의하고 알림 받기"(D15)와 스위치가 같은 동의 상태를 쓴다.
 * interestCodes가 null이면 관심 동네를 불러오지 못한 것이다
 */
export function NotificationSettings({
  marketingAgreed,
  interestCodes,
}: {
  marketingAgreed: boolean;
  interestCodes: string[] | null;
}) {
  const consent = useMarketingConsent(marketingAgreed);
  return (
    <section className="flex flex-col gap-5 border-t pt-6" aria-label="알림 설정">
      <h2 className="font-semibold">알림</h2>
      {interestCodes ? (
        <InterestAreas initialCodes={interestCodes} consent={consent} />
      ) : (
        <p className="text-sm text-muted-foreground">
          관심 동네를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      <MarketingSwitch consent={consent} />
    </section>
  );
}
