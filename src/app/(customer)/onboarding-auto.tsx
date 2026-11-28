'use client';

import { useState } from 'react';

import { finishOnboarding } from './onboarding-actions';
import { OnboardingDialog } from './onboarding-dialog';

/** 이 탭에서 이미 닫았는지. 본 시각을 남기기 전에 화면이 다시 그려져도 또 열리지 않게 한다 */
let closedInThisTab = false;

/**
 * 처음 로그인한 고객에게 안내 창(C-107)을 바로 연다. 아직 안내를 보지 않은 계정일 때만 OnboardingGate가 둔다.
 * [시작하기]나 닫기(×)로 닫으면 본 시각을 남겨서 다음부터는 열리지 않는다(다른 기기에서도)
 */
export function OnboardingAuto() {
  const [open, setOpen] = useState(() => !closedInThisTab);
  return (
    <OnboardingDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) return;
        closedInThisTab = true;
        // 남기지 못해도(연결 끊김 등) 화면은 닫는다. 다음 로그인 때 한 번 더 보일 뿐이다
        finishOnboarding().catch(() => {});
      }}
    />
  );
}
