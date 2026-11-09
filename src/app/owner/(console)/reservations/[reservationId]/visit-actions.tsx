'use client';

// 방문 완료·노쇼 버튼과 확인 창 (O14, S-405·S-406, #130). 시작이 지났고 아직 처리하지 않은 예약에만 버튼이 보인다.
// 누르면 확인 창에서 한 번 더 눌러야 처리된다. 처리하면 화면이 새로 고쳐져 방문 완료·노쇼 상태와 가린 연락처가 보인다.
// 그 사이 다른 곳에서 처리·취소됐으면 창에 그 문구를 보여주고, 뒤의 화면은 지금 상태로 바뀐다.
// 그래서 버튼이 사라져도 창은 남도록 이 부품은 예약 상세에서 늘 같은 자리에 둔다.

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { VisitResult } from '@/server/visits/types';

import { recordReservationVisit } from '../actions';
import { VISIT_ACTIONS } from '../reservation-detail';

/** [방문 완료]·[노쇼] 버튼과 확인 창. 확인 창은 버튼이 사라져도 닫힐 때까지 남는다(위 설명) */
export function VisitActions({
  reservationId,
  canRecord,
  summary,
}: {
  reservationId: string;
  /** 버튼을 보여줄지(canRecordVisit, 서버 시각 기준) */
  canRecord: boolean;
  /** 확인 창에 보여줄 예약. 예: "11/1(토) 14:00 커트 · 예약번호 1234-5678-9012" */
  summary: string;
}) {
  const [target, setTarget] = useState<VisitResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** 버튼을 누르면 바로 처리하지 않고 확인 창을 연다(처리하면 바꿀 수 없어서) */
  function open(result: VisitResult) {
    setMessage(null);
    setTarget(result);
  }

  /** 처리하는 동안에는 창을 닫지 않는다(결과 문구를 놓치지 않게) */
  function close() {
    if (!pending) setTarget(null);
  }

  /** 확인 창 [방문 완료로 처리]·[노쇼로 처리]. 성공하면 창을 닫고, 실패하면 창에 이유를 보여준다 */
  function submit() {
    if (!target) return;
    setMessage(null);
    startTransition(async () => {
      const recorded = await recordReservationVisit(reservationId, target);
      if (!recorded.ok) {
        setMessage(recorded.error.message);
        return;
      }
      setTarget(null);
    });
  }

  const action = target ? VISIT_ACTIONS[target] : null;
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
      <Dialog open={target !== null} onOpenChange={(isOpen) => !isOpen && close()}>
        {action ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{action.title}</DialogTitle>
              <DialogDescription>{summary}</DialogDescription>
            </DialogHeader>
            <p>
              {action.consequence ? `${action.consequence} ` : null}
              <span className="font-semibold">처리하면 바꿀 수 없어요.</span>
            </p>
            {message ? (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="lg" disabled={pending} onClick={close}>
                {canRecord ? '취소' : '닫기'}
              </Button>
              {/* 그 사이 처리·취소돼서 더는 처리할 수 없으면 확인 버튼을 잠근다 */}
              <Button
                type="button"
                size="lg"
                variant={target === 'no_show' ? 'destructive' : 'default'}
                disabled={pending || !canRecord}
                onClick={submit}
              >
                {pending ? '처리하는 중…' : action.confirm}
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
