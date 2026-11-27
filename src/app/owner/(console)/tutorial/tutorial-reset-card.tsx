'use client';

// 원장님 내 계정의 "사용 안내" 카드(S-412). 대시보드 체크 목록을 [건너뛰기]로 숨겼으면 여기서 다시 켠다.
// 체크 목록을 다 마쳤으면 내 계정이 이 카드를 그리지 않는다. 기록은 이 브라우저에만 있다(#618 DB 없음).

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { CHECKLIST_TITLE } from './checklist';
import { resetTutorial, useTutorialMemory } from './use-tutorial-memory';

export function TutorialResetCard({ shopId }: { shopId: string }) {
  const memory = useTutorialMemory(shopId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>사용 안내</CardTitle>
        <p className="text-sm text-muted-foreground">
          {memory?.checklistHidden
            ? `대시보드 맨 위의 ${CHECKLIST_TITLE} 목록을 건너뛰었어요. 다시 켜면 남은 단계를 이어서 볼 수 있어요.`
            : `대시보드 맨 위에 ${CHECKLIST_TITLE} 목록이 보이고 있어요.`}
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {memory?.checklistHidden ? (
          <Button type="button" variant="outline" onClick={() => resetTutorial(shopId)}>
            시작하기 목록 다시 보기
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
