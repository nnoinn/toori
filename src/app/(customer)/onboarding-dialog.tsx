'use client';

import { useState } from 'react';
import { cn } from 'cn';
import { BadgePercent, Bell, CircleAlert, type LucideIcon, Timer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  nextOnboardingStep,
  ONBOARDING_STEPS,
  type OnboardingIcon,
  previousOnboardingStep,
} from './onboarding-rules';

const ICONS: Record<OnboardingIcon, LucideIcon> = {
  discount: BadgePercent,
  hold: Timer,
  refund: CircleAlert,
  alert: Bell,
};

/**
 * 첫 로그인 안내 창(C-107). 4장을 [다음]으로 넘기고 마지막 장의 [시작하기]나 닫기(×)로 닫는다.
 * 고객 계정으로 처음 들어오면 저절로 열리고(onboarding-gate.tsx·onboarding-auto.tsx, 닫으면 본 시각을 남긴다),
 * 내 정보의 [안내 다시 보기]로 다시 연다(본 시각은 바꾸지 않는다).
 * 열 때마다 첫 장부터 보여 준다(부르는 쪽이 열 때 key를 바꾸지 않아도 되게 닫히면 첫 장으로 돌린다)
 */
export function OnboardingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const step = ONBOARDING_STEPS[index];
  const Icon = ICONS[step.icon];
  const next = nextOnboardingStep(index);
  const previous = previousOnboardingStep(index);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setIndex(0);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="gap-5 p-6 sm:max-w-md">
        <div className="flex flex-col items-center gap-4 pt-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-7" aria-hidden />
          </span>
          <p className="text-xs font-medium text-muted-foreground">
            <span className="sr-only">안내 </span>
            {index + 1} / {ONBOARDING_STEPS.length}
          </p>
          <DialogTitle className="text-lg leading-snug font-bold">{step.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              {step.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </DialogDescription>
          {step.bullets.length > 0 ? (
            <ul className="flex w-full flex-col gap-1 rounded-xl bg-muted p-3 text-left text-sm">
              {step.bullets.map((line) => (
                <li key={line}>- {line}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* 몇 번째 장인지 점으로도 보여 준다(글자 "1 / 4"가 같은 뜻이라 화면 읽기에서는 뺀다) */}
        <div className="flex justify-center gap-1.5" aria-hidden>
          {ONBOARDING_STEPS.map((item, i) => (
            <span
              key={item.key}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
              )}
            />
          ))}
        </div>

        <div className="flex gap-2">
          {previous !== null ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 flex-1"
              onClick={() => setIndex(previous)}
            >
              이전
            </Button>
          ) : null}
          {next !== null ? (
            <Button
              type="button"
              size="lg"
              className="h-11 flex-[2]"
              onClick={() => setIndex(next)}
            >
              다음
            </Button>
          ) : (
            <DialogClose asChild>
              <Button type="button" size="lg" className="h-11 flex-[2]">
                시작하기
              </Button>
            </DialogClose>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
