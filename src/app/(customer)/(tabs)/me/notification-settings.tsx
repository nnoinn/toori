'use client';

import { PushSwitch } from '@/features/push/push-switch';
import { CUSTOMER_PUSH_DESCRIPTION } from '@/features/push/push-texts';

import { ConsentSwitch, useOptionalConsent } from './consent-switch';
import { InterestAreas } from './interest-areas';
import { OPTIONAL_CONSENT_NAMES } from './profile-rules';

/**
 * 내 정보 > 알림 설정 (C-103, C-601·C-602·C-603, J14, #267). 이 기기 푸시 알림 켜기·끄기, 관심 동네, 관심 동네·찜한 샵 새 매물 알림, 이벤트·혜택 소식.
 * 거래 알림(예약 확정·리마인드 등)은 종류별로 끄지 않고, 새 매물과 이벤트·혜택만 각 동의로 켜고 끈다(#283).
 * 관심 동네의 "동의하고 알림 받기"(D15)와 스위치가 같은 동의 상태를 쓴다.
 * interestCodes가 null이면 관심 동네를 불러오지 못한 것이다
 */
export function NotificationSettings({
  interestAlertAgreed,
  marketingAgreed,
  interestCodes,
}: {
  interestAlertAgreed: boolean;
  marketingAgreed: boolean;
  interestCodes: string[] | null;
}) {
  const interestAlert = useOptionalConsent('interest_alert', interestAlertAgreed);
  const marketing = useOptionalConsent('marketing', marketingAgreed);
  return (
    <section className="flex flex-col gap-5 border-t pt-6" aria-label="알림 설정">
      <h2 className="font-semibold">알림</h2>
      <PushSwitch description={CUSTOMER_PUSH_DESCRIPTION} />
      {interestCodes ? (
        <InterestAreas initialCodes={interestCodes} consent={interestAlert} />
      ) : (
        <p className="text-sm text-muted-foreground">
          관심 동네를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      )}
      <ConsentSwitch
        consent={interestAlert}
        label={`${OPTIONAL_CONSENT_NAMES.interest_alert} 받기`}
        description="광고성 정보 수신 동의예요. 끄면 관심 동네와 찜한 샵의 새 매물을 알려 드리지 않아요."
      />
      <ConsentSwitch
        consent={marketing}
        label={`${OPTIONAL_CONSENT_NAMES.marketing} 받기`}
        description="광고성 정보 수신 동의예요. 끄면 이벤트·혜택 소식을 보내지 않아요."
      />
    </section>
  );
}
