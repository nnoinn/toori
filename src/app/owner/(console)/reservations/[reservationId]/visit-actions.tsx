'use client';

// 예약 상세의 방문 완료·노쇼 버튼 (O14, S-405·S-406, #130). 시작이 지났고 아직 처리하지 않은 예약에만 버튼이 보인다.
// 누르면 확인 창(visit-confirm-dialog.tsx)에서 한 번 더 눌러야 처리된다. 처리하면 화면이 새로 고쳐져
// 방문 완료·노쇼 상태와 가린 연락처가 보인다. 버튼이 사라져도 창은 닫힐 때까지 남도록 이 부품은 예약 상세에서 늘 같은 자리에 둔다.

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import type { VisitResult } from '@/server/visits/types';

import { VISIT_ACTIONS } from '../reservation-detail';
import { VisitConfirmDialog, type VisitTarget } from '../visit-confirm-dialog';

/** [방문 완료]·[노쇼] 버튼과 확인 창 */
export function VisitActions({
  reservationId,
  canRecord,
  summary,
}: {
  reservationId: string;
  /** 버튼을 보여줄지(canRecordVisit, 서버 시각 기준) */
  canRecord: boolean;
  /** 확인 창에 보여줄 예약(visitSummary). 예: "11/1(토) 14:00 커트 · 예약번호 1234-5678-9012" */
  summary: string;
}) {
  const [target, setTarget] = useState<VisitTarget | null>(null);
  const open = (result: VisitResult) => setTarget({ reservationId, summary, result });

  return (
    <>
      {canRecord ? (
        <CardContent className="flex gap-2">
          <Button type="button" size="lg" onClick={() => open('visited')}>
            {VISIT_ACTIONS.visited.button}
          </Button>
          <Button type="button" size="lg" variant="destructive" onClick={() => open('no_show')}>
            {VISIT_ACTIONS.no_show.button}
          </Button>
        </CardContent>
      ) : null}
      <VisitConfirmDialog target={target} canRecord={canRecord} onDone={() => setTarget(null)} />
    </>
  );
}
