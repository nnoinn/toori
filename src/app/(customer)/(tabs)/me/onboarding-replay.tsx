'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { SITE_NAME } from '@/lib/site';

import { OnboardingDialog } from '../../onboarding-dialog';
import { ONBOARDING_STEPS } from '../../onboarding-rules';

/** 내 정보의 [안내 다시 보기](C-107 🟡). 첫 로그인 안내 창을 다시 연다. 안내 본 시각은 바꾸지 않는다(#616 제안) */
export function OnboardingReplay() {
  const [open, setOpen] = useState(false);

  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-label={`${SITE_NAME} 이용 안내`}>
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">{SITE_NAME} 이용 안내</h2>
        <p className="text-sm text-muted-foreground">
          예약 방법과 취소 규정을 {ONBOARDING_STEPS.length}장으로 짧게 정리했어요.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="self-start max-md:h-10"
        onClick={() => setOpen(true)}
      >
        안내 다시 보기
      </Button>
      <OnboardingDialog open={open} onOpenChange={setOpen} />
    </section>
  );
}
