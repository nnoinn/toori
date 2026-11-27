'use client';

// 원장님 대시보드 맨 위 "투리 시작하기" 체크 목록(S-412, 3단계 3-A). 입점 신청 → 승인 → 메뉴 등록 → 첫 매물.
// 단계마다 끝났는지는 서버가 정해서 넘긴다(checklist.ts). 다 끝나면 서버가 이 카드를 그리지 않는다.
// [건너뛰기]로 숨기면 이 브라우저에 기억하고(#618 DB 없음), 내 계정의 [시작하기 목록 다시 보기]로 다시 켠다.
// PC 기준

import Link from 'next/link';
import { cn } from 'cn';
import { Circle, CircleCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { CHECKLIST_TITLE, type ChecklistStep, doneCount } from './checklist';
import { hideChecklist, useTutorialMemory } from './use-tutorial-memory';

export function TutorialChecklist({ shopId, steps }: { shopId: string; steps: ChecklistStep[] }) {
  const memory = useTutorialMemory(shopId);
  // 기록을 읽기 전(처음 그릴 때)이나 건너뛰었으면 그리지 않는다
  if (!memory || memory.checklistHidden) return null;

  const current = steps.find((step) => !step.done)?.key;
  return (
    <Card role="region" aria-labelledby="tutorial-checklist-title">
      <CardHeader>
        <CardTitle id="tutorial-checklist-title" className="flex items-baseline gap-2">
          {CHECKLIST_TITLE}
          <span className="text-sm font-normal text-muted-foreground">
            {doneCount(steps)}/{steps.length}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          차례대로 마치면 손님에게 매물을 보여줄 수 있어요. 건너뛰어도 내 계정에서 다시 볼 수
          있어요.
        </p>
        <CardAction>
          <Button type="button" variant="ghost" size="sm" onClick={() => hideChecklist(shopId)}>
            건너뛰기
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-3">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-3">
              {step.done ? (
                <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-sm', step.key === current && 'font-semibold')}>
                  {step.title}
                  <span className="sr-only">{step.done ? ' (끝남)' : ' (아직)'}</span>
                </span>
                <span className="text-sm text-muted-foreground">{step.description}</span>
              </div>
              {step.action ? (
                <Button asChild size="sm" variant={step.key === current ? 'default' : 'outline'}>
                  <Link href={step.action.href}>{step.action.label}</Link>
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
