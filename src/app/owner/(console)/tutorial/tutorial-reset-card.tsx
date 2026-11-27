'use client';

// 원장님 내 계정의 "사용 안내" 카드(S-412). 건너뛰었거나 이미 본 안내(대시보드 체크 목록, 화면별 말풍선)를 다시 켠다.
// 체크 목록을 다 마쳤으면 체크 목록은 다시 보이지 않고 말풍선만 다시 뜬다. 기록은 이 브라우저에만 있다(#618 DB 없음).

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { CHECKLIST_TITLE } from './checklist';
import { hasHiddenGuide } from './tutorial-memory';
import { resetTutorial, useTutorialMemory } from './use-tutorial-memory';

export function TutorialResetCard({
  shopId,
  checklistDone,
}: {
  shopId: string;
  /** 대시보드 체크 목록을 다 마쳤는지(마쳤으면 체크 목록은 다시 보이지 않는다) */
  checklistDone: boolean;
}) {
  const memory = useTutorialMemory(shopId);
  const hidden = memory !== null && hasHiddenGuide(memory);
  const guides = checklistDone
    ? '매물 등록·예약 상세의 안내 말풍선'
    : `대시보드 맨 위 ${CHECKLIST_TITLE} 목록과 매물 등록·예약 상세의 안내 말풍선`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>사용 안내</CardTitle>
        <p className="text-sm text-muted-foreground">
          {hidden
            ? `건너뛰었거나 이미 본 안내가 있어요. 다시 보기를 누르면 ${guides}이 처음처럼 다시 보여요.`
            : `${guides}이 처음 들어갈 때 보여요.`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {hidden ? (
          <Button type="button" variant="outline" onClick={() => resetTutorial(shopId)}>
            사용 안내 다시 보기
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/owner">
            대시보드로
            <ChevronRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
